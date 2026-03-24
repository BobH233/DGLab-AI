import {
  actionBatchSchema,
  type ActionBatch,
  type QueuedPlayerMessageInterpretation
} from "@dglab-ai/shared";
import { isLlmDebugEnabled } from "../lib/llmDebug.js";
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
  playerMessageInterpretations?: QueuedPlayerMessageInterpretation[];
  playerBodyItemState?: string[];
};

type ParserOptions = {
  turnId: string;
  emitPreviewEvent?: (event: OrchestratorPreviewEvent) => void;
  defaultTurnControl?: ActionBatch["turnControl"];
  defaultPlayerMessageInterpretations?: QueuedPlayerMessageInterpretation[];
  defaultPlayerBodyItemState?: string[];
};

type LineProtocolDiagnostics = {
  sawDone: boolean;
  usedDefaultTurnControl: boolean;
  usedDefaultPlayerMessageInterpretations: boolean;
  usedDefaultPlayerBodyItemState: boolean;
};

type MultilineControlLabel = "@turnControl" | "@playerMessageInterpretations" | "@playerBodyItemState";

const PREVIEWABLE_TEXT_FIELDS = new Set([
  "speak_to_player:args.message",
  "speak_to_agent:args.message",
  "perform_stage_direction:args.direction",
  "apply_story_effect:args.description",
  "emit_reasoning_summary:args.summary",
  "update_scene_state:args.location",
  "update_scene_state:args.phase",
  "update_scene_state:args.summary"
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

function truncateForDebug(text: string, maxLength = 400): string {
  if (text.length <= maxLength) {
    return text;
  }
  const headLength = Math.ceil(maxLength * 0.6);
  const tailLength = Math.max(0, maxLength - headLength - 13);
  return `${text.slice(0, headLength)}\n...<truncated>...\n${text.slice(-tailLength)}`;
}

export class LineProtocolTurnParser {
  private readonly draft: DraftBatch = {
    actions: []
  };

  private readonly turnId: string;
  private readonly emitPreviewEvent?: (event: OrchestratorPreviewEvent) => void;
  private readonly defaultTurnControl: ActionBatch["turnControl"];
  private readonly defaultPlayerMessageInterpretations: QueuedPlayerMessageInterpretation[];
  private readonly defaultPlayerBodyItemState: string[];
  private readonly rawParts: string[] = [];

  private controlLineBuffer = "";
  private currentAction: DraftAction | null = null;
  private currentActionIndex: number | null = null;
  private currentFieldPath: string | null = null;
  private currentFieldBuffer = "";
  private fieldAtLineStart = true;
  private fieldControlCandidate: string | null = null;
  private pendingMultilineControl:
    | {
        label: MultilineControlLabel;
        rawJson: string;
      }
    | null = null;
  private hasTurnControl = false;
  private hasPlayerMessageInterpretations = false;
  private hasPlayerBodyItemState = false;
  private seenDone = false;

  constructor(options: ParserOptions) {
    this.turnId = options.turnId;
    this.emitPreviewEvent = options.emitPreviewEvent;
    this.defaultTurnControl = options.defaultTurnControl ?? {
      continue: true,
      endStory: false,
      needsHandoff: false
    };
    this.defaultPlayerMessageInterpretations = options.defaultPlayerMessageInterpretations ?? [];
    this.defaultPlayerBodyItemState = options.defaultPlayerBodyItemState ?? [];
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

  finish(): { data: ActionBatch; rawText: string; diagnostics: LineProtocolDiagnostics } {
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

    if (this.pendingMultilineControl) {
      this.commitMultilineControl(this.pendingMultilineControl.label, this.pendingMultilineControl.rawJson);
      this.pendingMultilineControl = null;
    }

    if (this.currentAction) {
      throw new Error(`Line protocol ended before action ${this.currentAction.tool} was closed`);
    }

    if (!this.seenDone) {
      throw new Error("Line protocol missing required @done terminator");
    }

    const data = actionBatchSchema.parse({
      actions: this.draft.actions,
      turnControl: this.draft.turnControl ?? this.defaultTurnControl,
      playerMessageInterpretations: this.draft.playerMessageInterpretations ?? this.defaultPlayerMessageInterpretations,
      playerBodyItemState: this.draft.playerBodyItemState ?? this.defaultPlayerBodyItemState
    });

    return {
      data,
      rawText: this.rawParts.join(""),
      diagnostics: {
        sawDone: this.seenDone,
        usedDefaultTurnControl: !this.hasTurnControl,
        usedDefaultPlayerMessageInterpretations: !this.hasPlayerMessageInterpretations,
        usedDefaultPlayerBodyItemState: !this.hasPlayerBodyItemState
      }
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
        path,
        value
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

    if (this.pendingMultilineControl) {
      this.processPendingMultilineControlLine(line);
      return;
    }

    if (this.seenDone) {
      throw new Error("Line protocol contained extra content after @done");
    }

    if (trimmed.startsWith("@action ")) {
      if (this.currentAction || this.currentFieldPath) {
        throw new Error("Encountered @action before the previous action was closed");
      }
      const parsed = this.parseControlJson("@action", trimmed.slice("@action ".length)) as Record<string, unknown>;
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
      this.hasTurnControl = true;
      this.parseOrBufferMultilineControl("@turnControl", trimmed.slice("@turnControl ".length));
      return;
    }

    if (trimmed.startsWith("@playerBodyItemState ")) {
      if (this.currentAction || this.currentFieldPath) {
        throw new Error("@playerBodyItemState must appear after all actions are closed");
      }
      this.hasPlayerBodyItemState = true;
      this.parseOrBufferMultilineControl("@playerBodyItemState", trimmed.slice("@playerBodyItemState ".length));
      return;
    }

    if (trimmed.startsWith("@playerMessageInterpretations ")) {
      if (this.currentAction || this.currentFieldPath) {
        throw new Error("@playerMessageInterpretations must appear after all actions are closed");
      }
      this.hasPlayerMessageInterpretations = true;
      this.parseOrBufferMultilineControl(
        "@playerMessageInterpretations",
        trimmed.slice("@playerMessageInterpretations ".length)
      );
      return;
    }

    if (trimmed === "@done") {
      this.seenDone = true;
      return;
    }

    throw new Error(`Unknown line protocol control line: ${trimmed}`);
  }

  private parseControlJson(
    label: "@action" | "@turnControl" | "@playerMessageInterpretations" | "@playerBodyItemState",
    rawJson: string
  ): unknown {
    try {
      return JSON.parse(rawJson);
    } catch (error) {
      const parseMessage = error instanceof Error ? error.message : String(error);
      const debugPayload = {
        turnId: this.turnId,
        label,
        error: parseMessage,
        rawJson,
        rawJsonPreview: truncateForDebug(rawJson, 800),
        currentActionTool: this.currentAction?.tool ?? null,
        currentFieldPath: this.currentFieldPath,
        controlLineBuffer: this.controlLineBuffer,
        rawTextTail: truncateForDebug(this.rawParts.join("").slice(-2000), 1000)
      };

      if (isLlmDebugEnabled()) {
        console.error("[LLM DEBUG] line_protocol_control_json_parse_failed");
        console.error(JSON.stringify(debugPayload, null, 2));
      }

      throw new Error(
        `Failed to parse ${label} JSON: ${parseMessage}. JSON fragment: ${truncateForDebug(rawJson, 240)}`
      );
    }
  }

  private parseOrBufferMultilineControl(label: MultilineControlLabel, rawJson: string): void {
    try {
      this.commitMultilineControl(label, rawJson);
    } catch {
      this.pendingMultilineControl = {
        label,
        rawJson
      };
    }
  }

  private processPendingMultilineControlLine(line: string): void {
    if (!this.pendingMultilineControl) {
      return;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith("@")) {
      this.commitMultilineControl(this.pendingMultilineControl.label, this.pendingMultilineControl.rawJson);
      this.pendingMultilineControl = null;
      this.processControlLine(line);
      return;
    }

    this.pendingMultilineControl.rawJson += `\n${line}`;
  }

  private commitMultilineControl(label: MultilineControlLabel, rawJson: string): void {
    if (label === "@turnControl") {
      this.draft.turnControl = this.parseControlJson(label, rawJson) as ActionBatch["turnControl"];
      this.emitPreviewEvent?.({
        type: "llm.turn.control",
        payload: {
          turnId: this.turnId,
          value: this.draft.turnControl
        }
      });
      return;
    }

    if (label === "@playerMessageInterpretations") {
      this.draft.playerMessageInterpretations = this.parseControlJson(label, rawJson) as QueuedPlayerMessageInterpretation[];
      this.emitPreviewEvent?.({
        type: "llm.turn.player_message_interpretations",
        payload: {
          turnId: this.turnId,
          value: this.draft.playerMessageInterpretations
        }
      });
      return;
    }

    this.draft.playerBodyItemState = this.parseControlJson(label, rawJson) as string[];
    this.emitPreviewEvent?.({
      type: "llm.turn.player_body_item_state",
      payload: {
        turnId: this.turnId,
        value: this.draft.playerBodyItemState
      }
    });
  }
}
