import type {
  AppConfig,
  LlmCallListResponse,
  MemoryDebugResponse,
  Session,
  SessionEvent,
  SessionListItem,
  TimerUpdate,
  ToolContext,
  UpdateDraftRequest
} from "@dglab-ai/shared";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(payload.message ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getAppConfig(): Promise<AppConfig> {
    return request<AppConfig>("/config");
  },
  listLlmCalls(page = 1, pageSize = 25): Promise<LlmCallListResponse> {
    return request<LlmCallListResponse>(`/llm-calls?page=${page}&pageSize=${pageSize}`);
  },
  saveAppConfig(config: AppConfig): Promise<AppConfig> {
    return request<AppConfig>("/config", {
      method: "PUT",
      body: JSON.stringify(config)
    });
  },
  setActiveBackend(backendId: string): Promise<AppConfig> {
    return request<AppConfig>("/config/active-backend", {
      method: "PATCH",
      body: JSON.stringify({ backendId })
    });
  },
  listSessions(): Promise<SessionListItem[]> {
    return request<SessionListItem[]>("/sessions");
  },
  createDraft(playerBrief: string, toolContext?: ToolContext): Promise<Session> {
    return request<Session>("/sessions/draft", {
      method: "POST",
      body: JSON.stringify({
        playerBrief,
        ...(toolContext ? { toolContext } : {})
      })
    });
  },
  getSession(id: string): Promise<Session> {
    return request<Session>(`/sessions/${id}`);
  },
  updateDraft(id: string, patch: UpdateDraftRequest): Promise<Session> {
    return request<Session>(`/sessions/${id}/draft`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
  },
  confirmSession(id: string): Promise<Session> {
    return request<Session>(`/sessions/${id}/confirm`, {
      method: "POST"
    });
  },
  confirmSessionWithContext(id: string, toolContext?: ToolContext): Promise<Session> {
    return request<Session>(`/sessions/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify(toolContext ? { toolContext } : {})
    });
  },
  postMessage(id: string, text: string, toolContext?: ToolContext): Promise<Session> {
    return request<Session>(`/sessions/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({
        text,
        ...(toolContext ? { toolContext } : {})
      })
    });
  },
  retrySession(id: string, toolContext?: ToolContext): Promise<Session> {
    return request<Session>(`/sessions/${id}/retry`, {
      method: "POST",
      body: JSON.stringify(toolContext ? { toolContext } : {})
    });
  },
  requestAutoTick(id: string, toolContext?: ToolContext): Promise<Session> {
    return request<Session>(`/sessions/${id}/auto-tick`, {
      method: "POST",
      body: JSON.stringify(toolContext ? { toolContext } : {})
    });
  },
  updateTimer(id: string, body: TimerUpdate): Promise<Session> {
    return request<Session>(`/sessions/${id}/timer`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  },
  getEvents(id: string, cursor?: number): Promise<SessionEvent[]> {
    const query = cursor ? `?cursor=${cursor}` : "";
    return request<SessionEvent[]>(`/sessions/${id}/events${query}`);
  },
  getMemoryDebug(id: string): Promise<MemoryDebugResponse> {
    return request<MemoryDebugResponse>(`/sessions/${id}/memory-debug`);
  },
  streamUrl(id: string): string {
    return `${API_BASE}/sessions/${id}/stream`;
  }
};
