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
import { getSavedAuthPassword, notifyAuthRequired } from "./auth";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

type ApiRequestInit = RequestInit & {
  authPassword?: string;
  skipAuthRedirect?: boolean;
};

async function request<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const {
    authPassword: explicitAuthPassword,
    skipAuthRedirect,
    headers: initHeaders,
    ...requestInit
  } = init ?? {};

  const headers = new Headers(initHeaders);
  headers.set("Content-Type", "application/json");
  const authPassword = explicitAuthPassword ?? getSavedAuthPassword();
  if (authPassword) {
    headers.set("x-auth-password", authPassword);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...requestInit,
    headers
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    if (response.status === 401 && !skipAuthRedirect) {
      notifyAuthRequired();
    }
    throw new Error(payload.message ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

export const api = {
  login(password: string): Promise<{ ok: true }> {
    return request<{ ok: true }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
      skipAuthRedirect: true
    });
  },
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
    const authPassword = getSavedAuthPassword();
    if (!authPassword) {
      return `${API_BASE}/sessions/${id}/stream`;
    }
    return `${API_BASE}/sessions/${id}/stream?authPassword=${encodeURIComponent(authPassword)}`;
  }
};
