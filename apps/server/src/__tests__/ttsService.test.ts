import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeAppConfig, type AppConfig, type LlmConfig, type SessionEvent } from "@dglab-ai/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TtsService, normalizeTtsText } from "../services/TtsService.js";
import type { TtsAudioCacheRecord } from "../types/contracts.js";

const config: LlmConfig = {
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test",
  model: "test-model",
  temperature: 0.7,
  reasoningEffort: "medium",
  maxTokens: 500,
  topP: 1,
  requestTimeoutMs: 1000,
  toolStates: {}
};

class TtsStoreStub {
  public appConfig: AppConfig = normalizeAppConfig({
    ...normalizeAppConfig(config),
    tts: {
      baseUrl: "http://192.168.8.108:8080",
      roleMappings: [
        {
          id: "mapping-lisha",
          characterName: "丽莎",
          referenceId: "lisha"
        }
      ]
    }
  });

  public event: SessionEvent = {
    sessionId: "session-1",
    seq: 12,
    type: "agent.speak_player",
    source: "agent",
    agentId: "lisa",
    createdAt: "2026-03-23T10:00:00.000Z",
    payload: {
      speaker: "丽莎",
      message: "<emo_inst>low voice</emo_inst> 妈妈是不是教过你，<emo_inst>emphasis</emo_inst> 在我的房间里，你没有点单的资格。<delay>1000</delay> <emo_inst>whisper</emo_inst> 不过……既然你这么诚心诚意地祈求了。"
    }
  };

  public ttsAudioCache = new Map<string, TtsAudioCacheRecord>();

  async init() {}
  async getConfig() { return config; }
  async saveConfig(next: LlmConfig) { return next; }
  async getAppConfig() { return this.appConfig; }
  async saveAppConfig(next: AppConfig) {
    this.appConfig = next;
    return next;
  }
  async listSessions() { return []; }
  async createSession() { throw new Error("not implemented"); }
  async getSession() { return null; }
  async getEvent(sessionId: string, seq: number) {
    return sessionId === this.event.sessionId && seq === this.event.seq ? this.event : null;
  }
  async replaceSession() {}
  async appendEvents() { return []; }
  async getEvents() { return [this.event]; }
  async listSchedulableSessions() { return []; }
  async getTtsAudioCache(key: string) { return this.ttsAudioCache.get(key) ?? null; }
  async saveTtsAudioCache(record: TtsAudioCacheRecord) {
    this.ttsAudioCache.set(record.key, record);
    return record;
  }
  async touchTtsAudioCache(key: string, accessedAt: string) {
    const existing = this.ttsAudioCache.get(key);
    if (!existing) {
      return;
    }
    this.ttsAudioCache.set(key, {
      ...existing,
      lastAccessedAt: accessedAt
    });
  }
}

const originalFetch = globalThis.fetch;

afterEach(async () => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("normalizeTtsText", () => {
  it("converts emo tags, strips delays, and replaces periods with short pauses", () => {
    expect(normalizeTtsText(
      "<emo_inst>low voice</emo_inst> 妈妈是不是教过你，<emo_inst>emphasis</emo_inst> 在我的房间里，你没有点单的资格。<delay>1000</delay> <emo_inst>whisper</emo_inst> 不过……既然你这么诚心诚意地祈求了，这份刺骨的奖励，你可要连一滴都不剩地咽下去哦。"
    )).toBe(
      "[low voice] 妈妈是不是教过你，[emphasis] 在我的房间里，你没有点单的资格[short pause][whisper] 不过[short pause]既然你这么诚心诚意地祈求了，这份刺骨的奖励，你可要连一滴都不剩地咽下去哦[short pause]"
    );
  });
});

describe("TtsService", () => {
  it("caches generated audio by normalized request payload", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dglabai-tts-"));
    const store = new TtsStoreStub();
    const fetchMock = vi.fn(async () => new Response(Buffer.from("fake-mp3"), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg"
      }
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const service = new TtsService(store as never, tempDir);
      const first = await service.synthesizeEventAudio("session-1", 12);
      const second = await service.synthesizeEventAudio("session-1", 12);

      expect(first.cacheHit).toBe(false);
      expect(second.cacheHit).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(store.ttsAudioCache.size).toBe(1);
      expect([...store.ttsAudioCache.values()][0]?.normalizedText).toContain("[short pause]");
      expect(first.filePath).toBe(second.filePath);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
