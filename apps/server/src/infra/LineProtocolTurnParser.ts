import {
  actionBatchSchema,
  type ActionBatch
} from "@dglab-ai/shared";
import type { OrchestratorPreviewEvent } from "../types/contracts.js";

type DraftAction = {
  actorAgentId: string;
  tool: string;
  whyVisible?: string;
  targetScope?: "player" | "agents" | "scene" | "system";
  args: Record<string, unknown>;
};

type DraftBatch = {
  actions: DraftAction[];
  turnControl?: ActionBatch["turnControl"];
  playerBodyItemState?: string[];
};

type ParserOptions = {
  turnId: string;
  emitPreviewEvent?: (event: OrchestratorPreviewEvent) => void;
};

const PREVIEWABLE_TEXT_FIELDS = new Set([
  "speak_to_player:args.message",
  "speak_to_agent:args.message",
  "perform_stage_direction:args.direction",
  "apply_story_effect:args.description",
  "emit_reasoning_summary:args.summary"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setObjectPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    throw new Error("Field path cannot be empty");
  }

  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    const existing = cursor[segment];
    if (!isPlainObject(existing)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }

  cursor[segments[segments.length - 1]!] = value;
}

function normalizeFieldText(value: string): string {
  return value.replace(/\r?\n$/, "");
}

function parseFieldValue(tool: string, path: string, rawValue: string): unknown {
  const normalized = normalizeFieldText(rawValue);
  if (PREVIEWABLE_TEXT_FIELDS.has(`${tool}:${path}`)) {
    return normalized;
  }

  const trimmed = normalized.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return normalized;
  }
}

export class LineProtocolTurnParser {
  private readonly draft: DraftBatch = {
    actions: []
  };

  private readonly turnId: string;
  private readonly emitPreviewEvent?: (event: OrchestratorPreviewEvent) => void;
  private readonly rawParts: string[] = [];

  private controlLineBuffer = "";
  private currentAction: DraftAction | null = null;
  private currentActionIndex: number | null = null;
  private currentFieldPath: string | null = null;
  private currentFieldBuffer = "";
  private fieldAtLineStart = true;
  private fieldControlCandidate: string | null = null;
  private seenDone = false;

  constructor(options: ParserOptions) {
    this.turnId = options.turnId;
    this.emitPreviewEvent = options.emitPreviewEvent;
  }

  push(chunk: string): void {
    if (!chunk) {
      return;
    }
    this.rawParts.push(chunk);

    for (const char of chunk) {
      if (char === "\r") {
        continue;
      }
      if (this.currentFieldPath) {
        this.consumeFieldChar(char);
        continue;
      }
      this.consumeControlChar(char);
    }
  }

  finish(): { data: ActionBatch; rawText: string } {
    if (this.currentFieldPath) {
      if (this.fieldControlCandidate === "@endfield") {
        this.completeField();
      } else {
        throw new Error(`Line protocol ended before field "${this.currentFieldPath}" was closed`);
      }
    }

    if (this.controlLineBuffer.trim()) {
      this.processControlLine(this.controlLineBuffer);
      this.controlLineBuffer = "";
    }

    if (this.currentAction) {
      throw new Error(`Line protocol ended before action ${this.currentAction.tool} was closed`);
    }

    const data = actionBatchSchema.parse({
      actions: this.draft.actions,
      turnControl: this.draft.turnControl ?? {
        continue: true,
        endStory: false,
        needsHandoff: false
      },
      playerBodyItemState: this.draft.playerBodyItemState ?? []
    });

    return {
      data,
      rawText: this.rawParts.join("")
    };
  }

  private consumeControlChar(char: string): void {
    if (char === "\n") {
      this.processControlLine(this.controlLineBuffer);
      this.controlLineBuffer = "";
      return;
    }
    this.controlLineBuffer += char;
  }

  private consumeFieldChar(char: string): void {
    if (this.fieldControlCandidate !== null) {
      if (char === "\n") {
        if (this.fieldControlCandidate === "@endfield") {
          this.completeField();
        } else {
          this.appendFieldText(`${this.fieldControlCandidate}\n`);
        }
        this.fieldControlCandidate = null;
        this.fieldAtLineStart = true;
        return;
      }
      this.fieldControlCandidate += char;
      return;
    }

    if (this.fieldAtLineStart && char === "@") {
      this.fieldControlCandidate = "@";
      return;
    }

    this.appendFieldText(char);
    this.fieldAtLineStart = char === "\n";
  }

  private appendFieldText(text: string): void {
    if (!this.currentAction || !this.currentFieldPath) {
      throw new Error("Cannot append field text without an active field");
    }

    this.currentFieldBuffer += text;
    if (PREVIEWABLE_TEXT_FIELDS.has(`${this.currentAction.tool}:${this.currentFieldPath}`)) {
      this.emitPreviewEvent?.({
        type: "llm.action.text.delta",
        payload: {
          turnId: this.turnId,
          index: this.currentActionIndex,
          path: this.currentFieldPath,
          delta: text
        }
      });
    }
  }

  private completeField(): void {
    if (!this.currentAction || !this.currentFieldPath) {
      throw new Error("Encountered @endfield without an active field");
    }

    const path = this.currentFieldPath;
    const value = parseFieldValue(this.currentAction.tool, path, this.currentFieldBuffer);
    setObjectPath(this.currentAction as unknown as Record<string, unknown>, path, value);
    this.emitPreviewEvent?.({
      type: "llm.action.field.completed",
      payload: {
        turnId: this.turnId,
        index: this.currentActionIndex,
        path
      }
    });

    this.currentFieldPath = null;
    this.currentFieldBuffer = "";
    this.fieldAtLineStart = true;
    this.fieldControlCandidate = null;
  }

  private processControlLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (this.seenDone) {
      throw new Error("Line protocol contained extra content after @done");
    }

    if (trimmed.startsWith("@action ")) {
      if (this.currentAction || this.currentFieldPath) {
        throw new Error("Encountered @action before the previous action was closed");
      }
      const parsed = JSON.parse(trimmed.slice("@action ".length)) as Record<string, unknown>;
      const actorAgentId = typeof parsed.actorAgentId === "string" ? parsed.actorAgentId.trim() : "";
      const tool = typeof parsed.tool === "string" ? parsed.tool.trim() : "";
      if (!actorAgentId || !tool) {
        throw new Error("@action must include actorAgentId and tool");
      }
      this.currentAction = {
        actorAgentId,
        tool,
        whyVisible: typeof parsed.whyVisible === "string" ? parsed.whyVisible : undefined,
        targetScope: parsed.targetScope as DraftAction["targetScope"] | undefined,
        args: {}
      };
      this.currentActionIndex = this.draft.actions.length;
      this.emitPreviewEvent?.({
        type: "llm.action.started",
        payload: {
          turnId: this.turnId,
          index: this.currentActionIndex
        }
      });
      this.emitPreviewEvent?.({
        type: "llm.action.meta",
        payload: {
          turnId: this.turnId,
          index: this.currentActionIndex,
          actorAgentId,
          tool,
          targetScope: this.currentAction.targetScope ?? "scene"
        }
      });
      return;
    }

    if (trimmed.startsWith("@field ")) {
      if (!this.currentAction) {
        throw new Error("Encountered @field without an active action");
      }
      if (this.currentFieldPath) {
        throw new Error("Encountered nested @field before @endfield");
      }
      this.currentFieldPath = trimmed.slice("@field ".length).trim();
      if (!this.currentFieldPath) {
        throw new Error("@field must include a path");
      }
      this.currentFieldBuffer = "";
      this.fieldAtLineStart = true;
      this.fieldControlCandidate = null;
      return;
    }

    if (trimmed === "@endaction") {
      if (!this.currentAction) {
        throw new Error("Encountered @endaction without an active action");
      }
      if (this.currentFieldPath) {
        throw new Error("Encountered @endaction before @endfield");
      }
      this.draft.actions.push(this.currentAction);
      this.emitPreviewEvent?.({
        type: "llm.action.completed",
        payload: {
          turnId: this.turnId,
          index: this.currentActionIndex
        }
      });
      this.currentAction = null;
      this.currentActionIndex = null;
      return;
    }

    if (trimmed.startsWith("@turnControl ")) {
      if (this.currentAction || this.currentFieldPath) {
        throw new Error("@turnControl must appear after all actions are closed");
      }
      this.draft.turnControl = JSON.parse(trimmed.slice("@turnControl ".length)) as ActionBatch["turnControl"];
      this.emitPreviewEvent?.({
        type: "llm.turn.control",
        payload: {
          turnId: this.turnId,
          value: this.draft.turnControl
        }
      });
      return;
    }

    if (trimmed.startsWith("@playerBodyItemState ")) {
      if (this.currentAction || this.currentFieldPath) {
        throw new Error("@playerBodyItemState must appear after all actions are closed");
      }
      this.draft.playerBodyItemState = JSON.parse(trimmed.slice("@playerBodyItemState ".length)) as string[];
      this.emitPreviewEvent?.({
        type: "llm.turn.player_body_item_state",
        payload: {
          turnId: this.turnId,
          value: this.draft.playerBodyItemState
        }
      });
      return;
    }

    if (trimmed === "@done") {
      this.seenDone = true;
      return;
    }

    throw new Error(`Unknown line protocol control line: ${trimmed}`);
  }
}
