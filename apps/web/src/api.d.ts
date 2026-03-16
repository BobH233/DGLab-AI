import type { LlmConfig, Session, SessionEvent, SessionListItem, TimerUpdate, UpdateDraftRequest } from "@dglab-ai/shared";
export declare const api: {
    getConfig(): Promise<LlmConfig>;
    saveConfig(config: LlmConfig): Promise<LlmConfig>;
    listSessions(): Promise<SessionListItem[]>;
    createDraft(playerBrief: string): Promise<Session>;
    getSession(id: string): Promise<Session>;
    updateDraft(id: string, patch: UpdateDraftRequest): Promise<Session>;
    confirmSession(id: string): Promise<Session>;
    postMessage(id: string, text: string): Promise<Session>;
    updateTimer(id: string, body: TimerUpdate): Promise<Session>;
    getEvents(id: string, cursor?: number): Promise<SessionEvent[]>;
    streamUrl(id: string): string;
};
