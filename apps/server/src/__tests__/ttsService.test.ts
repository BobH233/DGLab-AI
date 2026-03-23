import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeAppConfig, type AppConfig, type LlmConfig, type SessionEvent } from "@dglab-ai/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TtsService, normalizeTtsText, splitNormalizedTtsText } from "../services/TtsService.js";
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
        },
        {
          id: "mapping-narrator",
          characterName: "旁白",
          referenceId: "wendi"
        },
        {
          id: "mapping-player",
          characterName: "玩家",
          referenceId: "player_voice"
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
  async getTtsAudioCaches(keys: string[]) {
    return keys
      .map((key) => this.ttsAudioCache.get(key) ?? null)
      .filter((record): record is TtsAudioCacheRecord => Boolean(record));
  }
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
  async getSessionTtsBatchJob() { return null; }
  async saveSessionTtsBatchJob(job: unknown) { return job; }
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

  it("normalizes decorative quote punctuation before sending text to TTS", () => {
    expect(normalizeTtsText("「好啦，『余兴节目』开始了。”她轻声说。")).toBe(
      "\"好啦，\"余兴节目\"开始了[short pause]\"她轻声说[short pause]"
    );
  });

  it("splits long normalized text on short pauses before hard cutting", () => {
    expect(splitNormalizedTtsText(
      "第一句先慢慢说完[short pause]第二句也要完整停顿[short pause]第三句最后收尾",
      16,
      0
    )).toEqual([
      "第一句先慢慢说完[short pause]",
      "第二句也要完整停顿[short pause]",
      "第三句最后收尾"
    ]);
  });

  it("keeps the provided long sample under a safer segment size by default", () => {
    const sample = "夜晚的闷热还未完全散去，窗外的蝉鸣与远处的太鼓声交织[short pause]你被引导着跪坐在长野原烟花店后院的一间隐秘和室里，身下是散发着蔺草清香的柔软榻榻米[short pause]宵宫刚刚结束了一天的祭典工作，身上还穿着那套标志性的夏日装扮，白皙的肌肤上覆着一层薄薄的香汗，空气中混杂着硝烟与她特有的甜美体味[short pause]你已经被她用红色的粗麻绳牢牢反绑住了双手，而你的小肚子和大腿内侧，正贴着她特意准备的「特殊机关」——两组电击装置的贴片，微弱的电流正处于待机状态[short pause]宵宫赤着双足，踩在榻榻米上发出轻微的沙沙声[short pause]她手里握着一根装饰着红色流苏的精致竹鞭，带着戏谑而又充满爱意的笑意，缓缓走到你面前蹲下[short pause]「好啦，大英雄，外面的烟花已经放完了，现在是只属于我们俩的『余兴节目』时间了哦[short pause]";
    const parts = splitNormalizedTtsText(sample);

    expect(parts).toHaveLength(3);
    expect(parts.map((part) => part.length)).toEqual([170, 175, 52]);
  });
});

describe("TtsService", () => {
  it("caches generated audio by normalized request payload", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dglabai-tts-"));
    const store = new TtsStoreStub();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(Buffer.from("fake-mp3"), {
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

  it("uses the narrator mapping for stage direction events", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dglabai-tts-"));
    const store = new TtsStoreStub();
    store.event = {
      sessionId: "session-1",
      seq: 13,
      type: "agent.stage_direction",
      source: "agent",
      agentId: "director",
      createdAt: "2026-03-23T10:02:00.000Z",
      payload: {
        speaker: "宵宫",
        direction: "<emo_inst>soft</emo_inst> 她俯下身，慢慢贴近你的耳边。"
      }
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Response(Buffer.from("fake-mp3"), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg"
        }
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const service = new TtsService(store as never, tempDir);
      await service.synthesizeEventAudio("session-1", 13);

      const requestCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined] | undefined;
      const requestInit = requestCall?.[1];
      const requestBody = JSON.parse(String(requestInit?.body ?? "{}")) as {
        reference_id?: string;
        text?: string;
      };
      expect(requestBody.reference_id).toBe("wendi");
      expect(requestBody.text).toContain("[soft]");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("uses the player mapping for player message events", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dglabai-tts-"));
    const store = new TtsStoreStub();
    store.event = {
      sessionId: "session-1",
      seq: 14,
      type: "player.message",
      source: "player",
      createdAt: "2026-03-23T10:03:00.000Z",
      payload: {
        text: "我会乖乖听话的……"
      }
    };
    const fetchMock = vi.fn(async () => new Response(Buffer.from("fake-mp3"), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg"
      }
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const service = new TtsService(store as never, tempDir);
      await service.synthesizeEventAudio("session-1", 14);

      const requestCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined] | undefined;
      const requestInit = requestCall?.[1];
      const requestBody = JSON.parse(String(requestInit?.body ?? "{}")) as {
        reference_id?: string;
        text?: string;
      };
      expect(requestBody.reference_id).toBe("player_voice");
      expect(requestBody.text).toContain("[short pause]");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("splits long requests into multiple TTS calls and merges the audio", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dglabai-tts-"));
    const store = new TtsStoreStub();
    store.event = {
      sessionId: "session-1",
      seq: 15,
      type: "player.message",
      source: "player",
      createdAt: "2026-03-23T10:04:00.000Z",
      payload: {
        text: Array.from({ length: 24 }, (_value, index) => `这是第${index + 1}句测试文本，会在停顿后继续展开。`).join("")
      }
    };

    let callIndex = 0;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
      callIndex += 1;
      return new Response(Buffer.from(`audio-${callIndex}`), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg"
        }
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const service = new TtsService(store as never, tempDir);
      const result = await service.synthesizeEventAudio("session-1", 15);
      const mergedBuffer = await readFile(result.filePath);

      expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
      const requestTexts = fetchMock.mock.calls.map((call) => {
        const [, init] = call as [string, RequestInit | undefined];
        const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
        return body.text ?? "";
      });
      expect(requestTexts.join("")).toBe(normalizeTtsText((store.event.payload as { text: string }).text));
      expect(mergedBuffer.toString("utf8")).toBe(Array.from({ length: fetchMock.mock.calls.length }, (_value, index) => `audio-${index + 1}`).join(""));
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("retries with smaller segments after a CUDA out of memory response", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dglabai-tts-"));
    const store = new TtsStoreStub();
    store.event = {
      sessionId: "session-1",
      seq: 16,
      type: "player.message",
      source: "player",
      createdAt: "2026-03-23T10:05:00.000Z",
      payload: {
        text: Array.from(
          { length: 8 },
          () => "这是一段会先触发单次请求失败的较长文本，随后应该退化成更短的片段分别合成。"
        ).join("")
      }
    };

    let callIndex = 0;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
      callIndex += 1;
      if (callIndex === 1) {
        return new Response("CUDA out of memory", {
          status: 500
        });
      }
      return new Response(Buffer.from(`retry-${callIndex}`), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg"
        }
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const service = new TtsService(store as never, tempDir);
      const result = await service.synthesizeEventAudio("session-1", 16);
      const mergedBuffer = await readFile(result.filePath);

      expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
      expect(mergedBuffer.toString("utf8")).toBe(
        Array.from({ length: fetchMock.mock.calls.length - 1 }, (_value, index) => `retry-${index + 2}`).join("")
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
