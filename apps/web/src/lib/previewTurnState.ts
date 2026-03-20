import {
  appendStreamingInlineDelay,
  createStreamingInlineDelayState,
  finalizeStreamingInlineDelay,
  type StreamingInlineDelayState
} from "./inlineDelays";

export type PreviewAction = {
  index: number;
  actorAgentId?: string;
  tool?: string;
  targetScope?: string;
  textByPath: Record<string, StreamingInlineDelayState>;
  valueByPath: Record<string, unknown>;
  completedFields: string[];
  completed: boolean;
};

export type PreviewTurnState = {
  turnId: string;
  actions: PreviewAction[];
  restoredActionIndexes?: number[];
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  turnControl?: {
    continue: boolean;
    endStory: boolean;
    needsHandoff: boolean;
  };
  playerBodyItemState?: string[];
  status: "streaming" | "completed" | "failed";
  errorMessage?: string;
};

function numberFromPayload(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function ensureAction(state: PreviewTurnState, index: number): PreviewAction {
  let action = state.actions.find((item) => item.index === index);
  if (!action) {
    action = {
      index,
      textByPath: {},
      valueByPath: {},
      completedFields: [],
      completed: false
    };
    state.actions.push(action);
    state.actions.sort((left, right) => left.index - right.index);
  }
  return action;
}

function ensureTextState(action: PreviewAction, path: string): StreamingInlineDelayState {
  const existing = action.textByPath[path];
  if (existing) {
    return existing;
  }
  const created = createStreamingInlineDelayState();
  action.textByPath[path] = created;
  return created;
}

export function applyPreviewEvent(
  current: PreviewTurnState | null,
  type: string,
  payload: Record<string, unknown>
): PreviewTurnState | null {
  switch (type) {
    case "llm.turn.started":
      return {
        turnId: String(payload.turnId ?? ""),
        actions: [],
        model: typeof payload.model === "string" ? payload.model : undefined,
        status: "streaming"
      };
    case "llm.turn.failed":
      if (!current || current.turnId !== String(payload.turnId ?? "")) {
        return null;
      }
      return {
        ...current,
        status: "failed",
        errorMessage: typeof payload.message === "string" ? payload.message : undefined
      };
    case "llm.turn.completed":
      if (!current || current.turnId !== String(payload.turnId ?? "")) {
        return current;
      }
      return {
        ...current,
        model: typeof payload.model === "string" ? payload.model : current.model,
        promptTokens: numberFromPayload(payload.promptTokens) ?? current.promptTokens,
        completionTokens: numberFromPayload(payload.completionTokens) ?? current.completionTokens,
        totalTokens: numberFromPayload(payload.totalTokens) ?? current.totalTokens,
        status: "completed"
      };
    case "llm.turn.control":
      if (!current || current.turnId !== String(payload.turnId ?? "")) {
        return current;
      }
      return {
        ...current,
        turnControl: payload.value as PreviewTurnState["turnControl"]
      };
    case "llm.turn.player_body_item_state":
      if (!current || current.turnId !== String(payload.turnId ?? "")) {
        return current;
      }
      return {
        ...current,
        playerBodyItemState: Array.isArray(payload.value)
          ? payload.value.map((item) => String(item))
          : []
      };
    case "llm.action.started":
    case "llm.action.meta":
    case "llm.action.text.delta":
    case "llm.action.field.completed":
    case "llm.action.completed": {
      if (!current || current.turnId !== String(payload.turnId ?? "")) {
        return current;
      }

      const next: PreviewTurnState = {
        ...current,
        actions: current.actions.map((action) => ({
          ...action,
          textByPath: { ...action.textByPath },
          valueByPath: { ...action.valueByPath },
          completedFields: [...action.completedFields]
        }))
      };
      const index = Number(payload.index ?? -1);
      const action = ensureAction(next, index);

      if (type === "llm.action.meta") {
        action.actorAgentId = typeof payload.actorAgentId === "string" ? payload.actorAgentId : action.actorAgentId;
        action.tool = typeof payload.tool === "string" ? payload.tool : action.tool;
        action.targetScope = typeof payload.targetScope === "string" ? payload.targetScope : action.targetScope;
        return next;
      }

      if (type === "llm.action.text.delta") {
        const path = String(payload.path ?? "");
        const delta = String(payload.delta ?? "");
        action.textByPath[path] = appendStreamingInlineDelay(ensureTextState(action, path), delta);
        return next;
      }

      if (type === "llm.action.field.completed") {
        const path = String(payload.path ?? "");
        const existingTextState = action.textByPath[path];
        if (existingTextState) {
          action.textByPath[path] = finalizeStreamingInlineDelay(existingTextState);
        }
        if (payload.value !== undefined) {
          action.valueByPath[path] = payload.value;
        }
        if (!action.completedFields.includes(path)) {
          action.completedFields.push(path);
        }
        return next;
      }

      if (type === "llm.action.completed") {
        action.completed = true;
        return next;
      }

      return next;
    }
    default:
      return current;
  }
}

export function shouldClearPreviewOnCommittedEvent(eventType: string): boolean {
  return eventType === "system.tick_completed"
    || eventType === "system.tick_failed"
    || eventType === "system.story_ended";
}

export function previewTurnFromSnapshot(payload: Record<string, unknown>): PreviewTurnState | null {
  const snapshot = payload.previewTurn;
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }
  const restored = snapshot as PreviewTurnState;
  return {
    ...restored,
    restoredActionIndexes: Array.isArray(restored.actions)
      ? restored.actions.map((action) => action.index)
      : []
  };
}
