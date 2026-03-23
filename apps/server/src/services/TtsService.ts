import crypto from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { HttpError } from "../lib/errors.js";
import type { SessionStore } from "../types/contracts.js";

const HEALTH_RESPONSE_SCHEMA = z.object({
  status: z.string()
});

const REFERENCE_LIST_RESPONSE_SCHEMA = z.object({
  success: z.boolean(),
  reference_ids: z.array(z.string()),
  message: z.string().optional()
});

const TTS_TIMEOUT_MS = 120_000;
const DEFAULT_TTS_REQUEST_BODY = {
  use_memory_cache: "on",
  format: "mp3",
  streaming: false,
  chunk_length: 200,
  max_new_tokens: 1024,
  top_p: 0.9,
  repetition_penalty: 1.05,
  temperature: 0.9
} as const;

type TtsAudioResult = {
  filePath: string;
  mimeType: string;
  cacheHit: boolean;
};

export function normalizeTtsText(source: string): string {
  return source
    .replace(/<delay>\s*\d+\s*<\/delay>/gi, "")
    .replace(/<emo_inst>([\s\S]*?)<\/emo_inst>/gi, (_match, value: string) => {
      const content = value.trim();
      return content ? `[${content}]` : "";
    })
    .replace(/(?:\.{3,}|…+|。|\.)/g, "[short pause]")
    .replace(/\s+\[short pause\]/g, "[short pause]")
    .replace(/\[short pause\]\s+(?=\[[^\]]+\])/g, "[short pause]")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export class TtsService {
  private readonly cacheDir: string;

  constructor(
    private readonly store: SessionStore,
    cacheDir = process.env.TTS_CACHE_DIR ?? path.resolve(process.cwd(), ".data/tts-cache")
  ) {
    this.cacheDir = cacheDir;
  }

  async checkHealth(baseUrlOverride?: string): Promise<z.infer<typeof HEALTH_RESPONSE_SCHEMA>> {
    const baseUrl = await this.resolveBaseUrl(baseUrlOverride);
    return this.fetchJson(HEALTH_RESPONSE_SCHEMA, `${baseUrl}/v1/health`);
  }

  async listReferences(baseUrlOverride?: string): Promise<z.infer<typeof REFERENCE_LIST_RESPONSE_SCHEMA>> {
    const baseUrl = await this.resolveBaseUrl(baseUrlOverride);
    return this.fetchJson(REFERENCE_LIST_RESPONSE_SCHEMA, `${baseUrl}/v1/references/list?format=json`);
  }

  async synthesizeEventAudio(sessionId: string, seq: number): Promise<TtsAudioResult> {
    const event = await this.store.getEvent(sessionId, seq);
    if (!event) {
      throw new HttpError(404, `Session event ${seq} not found`);
    }
    const eventTtsPayload = this.buildEventTtsPayload(event);
    const sourceText = eventTtsPayload.text;
    const speaker = eventTtsPayload.speaker;
    if (!sourceText.trim()) {
      throw new HttpError(400, "This speech event has no text to synthesize");
    }
    if (!speaker) {
      throw new HttpError(400, "This speech event has no speaker information");
    }

    const appConfig = await this.store.getAppConfig();
    const ttsConfig = appConfig.tts ?? {
      baseUrl: undefined,
      roleMappings: []
    };
    const baseUrl = this.requireBaseUrl(ttsConfig.baseUrl);
    const referenceId = this.resolveReferenceId(speaker, ttsConfig.roleMappings);
    const normalizedText = normalizeTtsText(sourceText);
    if (!normalizedText) {
      throw new HttpError(400, "The speech text became empty after TTS normalization");
    }

    const key = crypto
      .createHash("sha256")
      .update(JSON.stringify({
        sessionId,
        seq,
        baseUrl,
        referenceId,
        normalizedText,
        format: DEFAULT_TTS_REQUEST_BODY.format
      }))
      .digest("hex");

    const cached = await this.store.getTtsAudioCache(key);
    if (cached && await this.fileExists(cached.filePath)) {
      await this.store.touchTtsAudioCache(key, new Date().toISOString());
      return {
        filePath: cached.filePath,
        mimeType: cached.mimeType,
        cacheHit: true
      };
    }

    const audioBuffer = await this.requestTtsAudio(baseUrl, normalizedText, referenceId);
    await mkdir(this.cacheDir, { recursive: true });
    const filePath = path.resolve(this.cacheDir, `${sessionId}-${seq}-${key.slice(0, 16)}.mp3`);
    await writeFile(filePath, audioBuffer);

    const now = new Date().toISOString();
    await this.store.saveTtsAudioCache({
      key,
      sessionId,
      eventSeq: seq,
      eventType: event.type,
      speaker,
      referenceId,
      baseUrl,
      sourceText,
      normalizedText,
      filePath,
      mimeType: "audio/mpeg",
      createdAt: now,
      lastAccessedAt: now
    });

    return {
      filePath,
      mimeType: "audio/mpeg",
      cacheHit: false
    };
  }

  private buildEventTtsPayload(event: {
    type: string;
    payload: Record<string, unknown>;
  }): {
    text: string;
    speaker: string;
  } {
    switch (event.type) {
      case "player.message":
        return {
          text: typeof event.payload.text === "string" ? event.payload.text : "",
          speaker: "玩家"
        };
      case "agent.speak_player":
        return {
          text: typeof event.payload.message === "string" ? event.payload.message : "",
          speaker: typeof event.payload.speaker === "string" ? event.payload.speaker.trim() : ""
        };
      case "agent.stage_direction":
        return {
          text: typeof event.payload.direction === "string" ? event.payload.direction : "",
          speaker: "旁白"
        };
      case "agent.story_effect":
        return {
          text: typeof event.payload.description === "string" ? event.payload.description : "",
          speaker: "旁白"
        };
      default:
        throw new HttpError(400, "Only player messages, character speech, stage direction, and story effect events can be read aloud");
    }
  }

  private async getConfiguredBaseUrl(): Promise<string> {
    const appConfig = await this.store.getAppConfig();
    return this.requireBaseUrl(appConfig.tts?.baseUrl);
  }

  private async resolveBaseUrl(baseUrlOverride?: string): Promise<string> {
    if (baseUrlOverride?.trim()) {
      return this.requireBaseUrl(baseUrlOverride);
    }
    return this.getConfiguredBaseUrl();
  }

  private requireBaseUrl(baseUrl: string | undefined): string {
    if (!baseUrl) {
      throw new HttpError(400, "TTS API 地址尚未配置");
    }
    return baseUrl.replace(/\/+$/, "");
  }

  private resolveReferenceId(
    speaker: string,
    mappings: Array<{ characterName: string; referenceId: string }>
  ): string {
    const normalizedSpeaker = speaker.trim();
    const exactMatch = mappings.find((mapping) => mapping.characterName.trim() === normalizedSpeaker);
    if (exactMatch) {
      return exactMatch.referenceId.trim();
    }

    const normalizedLowerSpeaker = normalizedSpeaker.toLocaleLowerCase();
    const looseMatch = mappings.find((mapping) => mapping.characterName.trim().toLocaleLowerCase() === normalizedLowerSpeaker);
    if (looseMatch) {
      return looseMatch.referenceId.trim();
    }

    throw new HttpError(400, `未找到角色 “${speaker}” 对应的 TTS reference_id，请先在设置页配置`);
  }

  private async requestTtsAudio(baseUrl: string, text: string, referenceId: string): Promise<Buffer> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text,
          reference_id: referenceId,
          ...DEFAULT_TTS_REQUEST_BODY
        }),
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS)
      });
    } catch (error) {
      throw new HttpError(502, `TTS 合成请求失败：${error instanceof Error ? error.message : String(error)}`);
    }

    if (!response.ok) {
      const message = await this.readErrorText(response);
      throw new HttpError(502, `TTS 合成失败：${message}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async fetchJson<T>(schema: z.ZodSchema<T>, url: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS)
      });
    } catch (error) {
      throw new HttpError(502, `TTS 服务请求失败：${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) {
      const message = await this.readErrorText(response);
      throw new HttpError(502, `TTS 服务请求失败：${message}`);
    }
    return schema.parse(await response.json());
  }

  private async readErrorText(response: Response): Promise<string> {
    const text = await response.text().catch(() => "");
    return text.trim() || response.statusText || `HTTP ${response.status}`;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
