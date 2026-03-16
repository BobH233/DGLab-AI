import type {
  LlmConfig,
  Session,
  SessionEvent,
  SessionListItem,
  TimerUpdate,
  UpdateDraftRequest
} from "@dglab-ai/shared";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:3001/api";

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
  getConfig(): Promise<LlmConfig> {
    return request<LlmConfig>("/config");
  },
  saveConfig(config: LlmConfig): Promise<LlmConfig> {
    return request<LlmConfig>("/config", {
      method: "PUT",
      body: JSON.stringify(config)
    });
  },
  listSessions(): Promise<SessionListItem[]> {
    return request<SessionListItem[]>("/sessions");
  },
  createDraft(playerBrief: string): Promise<Session> {
    return request<Session>("/sessions/draft", {
      method: "POST",
      body: JSON.stringify({ playerBrief })
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
  postMessage(id: string, text: string): Promise<Session> {
    return request<Session>(`/sessions/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text })
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
  streamUrl(id: string): string {
    return `${API_BASE}/sessions/${id}/stream`;
  }
};

