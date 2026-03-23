import type {
  AppConfig,
  LlmCallListResponse,
  MemoryDebugResponse,
  Session,
  SessionEvent,
  SessionListItem,
  SessionTtsPerformanceState,
  TimerUpdate,
  ToolContext,
  UpdateDraftRequest
} from "@dglab-ai/shared";
import { getSavedAuthPassword, notifyAuthRequired } from "./auth";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

export type TtsHealthResponse = {
  status: string;
};

export type TtsReferenceListResponse = {
  success: boolean;
  reference_ids: string[];
  message?: string;
};

type ApiRequestInit = RequestInit & {
  authPassword?: string;
  skipAuthRedirect?: boolean;
};

function buildHeaders(
  initHeaders: HeadersInit | undefined,
  explicitAuthPassword: string | undefined,
  contentType?: string
): Headers {
  const headers = new Headers(initHeaders);
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  const authPassword = explicitAuthPassword ?? getSavedAuthPassword();
  if (authPassword) {
    headers.set("x-auth-password", authPassword);
  }
  return headers;
}

async function request<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const {
    authPassword: explicitAuthPassword,
    skipAuthRedirect,
    headers: initHeaders,
    ...requestInit
  } = init ?? {};

  const headers = buildHeaders(initHeaders, explicitAuthPassword, "application/json");

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

async function requestBlob(path: string, init?: ApiRequestInit): Promise<Blob> {
  const {
    authPassword: explicitAuthPassword,
    skipAuthRedirect,
    headers: initHeaders,
    ...requestInit
  } = init ?? {};

  const headers = buildHeaders(initHeaders, explicitAuthPassword);
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
  return response.blob();
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
  getTtsHealth(baseUrl?: string): Promise<TtsHealthResponse> {
    const query = baseUrl ? `?baseUrl=${encodeURIComponent(baseUrl)}` : "";
    return request<TtsHealthResponse>(`/tts/health${query}`);
  },
  listTtsReferences(baseUrl?: string): Promise<TtsReferenceListResponse> {
    const query = baseUrl ? `?baseUrl=${encodeURIComponent(baseUrl)}` : "";
    return request<TtsReferenceListResponse>(`/tts/references${query}`);
  },
  getSessionEventTts(id: string, seq: number): Promise<Blob> {
    return requestBlob(`/tts/sessions/${id}/events/${seq}`, {
      headers: {
        Accept: "audio/mpeg"
      }
    });
  },
  getSessionTtsPerformance(id: string): Promise<SessionTtsPerformanceState> {
    return request<SessionTtsPerformanceState>(`/tts/sessions/${id}/performance`);
  },
  startSessionTtsBatch(id: string): Promise<SessionTtsPerformanceState> {
    return request<SessionTtsPerformanceState>(`/tts/sessions/${id}/performance/batch`, {
      method: "POST"
    });
  },
  cancelSessionTtsBatch(id: string): Promise<SessionTtsPerformanceState> {
    return request<SessionTtsPerformanceState>(`/tts/sessions/${id}/performance/batch`, {
      method: "DELETE"
    });
  },
  getSessionReadableTts(id: string, readableId: string): Promise<Blob> {
    return requestBlob(`/tts/sessions/${id}/readables/${encodeURIComponent(readableId)}`, {
      headers: {
        Accept: "audio/mpeg"
      }
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
