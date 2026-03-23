import crypto from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildReadableContentFromEvent,
  buildSessionReadableContents,
  sessionTtsPerformanceStateSchema,
  type AppConfig,
  type SessionReadableContent,
  type SessionTtsBatchJob,
  type SessionTtsPerformanceState,
  type TtsRoleMapping
} from "@dglab-ai/shared";
import { z } from "zod";
import { HttpError } from "../lib/errors.js";
import type { SessionStore, TtsAudioCacheRecord } from "../types/contracts.js";

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

const SHORT_PAUSE_TOKEN = "[short pause]";
const DEFAULT_TTS_SEGMENT_CHAR_LIMIT = parsePositiveInteger(process.env.TTS_MAX_SEGMENT_CHARS, 180);
const DEFAULT_TTS_SEGMENT_OVERFLOW_CHARS = parsePositiveInteger(process.env.TTS_SEGMENT_OVERFLOW_CHARS, 30);
const MIN_TTS_SEGMENT_CHAR_LIMIT = parsePositiveInteger(process.env.TTS_MIN_SEGMENT_CHARS, 32);
const ID3_V1_TAG_SIZE = 128;
const TTS_PUNCTUATION_NORMALIZATION_MAP: Record<string, string> = {
  "「": "\"",
  "」": "\"",
  "『": "\"",
  "』": "\"",
  "“": "\"",
  "”": "\"",
  "‘": "'",
  "’": "'"
};

const MPEG_SAMPLE_RATES: Record<number, [number, number, number]> = {
  0: [11025, 12000, 8000],
  2: [22050, 24000, 16000],
  3: [44100, 48000, 32000]
};

const MPEG_BITRATES: Record<string, number[]> = {
  V1L1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
  V1L2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
  V1L3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  V2L1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
  V2L2L3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
};

type TtsAudioResult = {
  filePath: string;
  mimeType: string;
  cacheHit: boolean;
  durationMs?: number;
  readableId: string;
};

type PreparedReadableContent = {
  readable: SessionReadableContent;
  cacheKey: string;
  normalizedText: string;
  baseUrl?: string;
  referenceId?: string;
  hasVoiceMapping: boolean;
};

type ActiveBatchJobState = {
  cancelRequested: boolean;
};

type Mp3FrameHeader = {
  bitrateKbps: number;
  sampleRate: number;
  frameLength: number;
  samplesPerFrame: number;
  versionIndex: number;
  layerIndex: number;
  channelMode: number;
};

export function normalizeTtsText(source: string): string {
  return source
    .replace(/[「」『』“”‘’]/g, (char) => TTS_PUNCTUATION_NORMALIZATION_MAP[char] ?? char)
    .replace(/<delay>\s*\d+\s*<\/delay>/gi, "")
    .replace(/<emo_inst>([\s\S]*?)<\/emo_inst>/gi, (_match, value: string) => {
      const content = value.trim();
      return content ? `[${content}]` : "";
    })
    .replace(/(?:\.{3,}|…+|。|\.)/g, SHORT_PAUSE_TOKEN)
    .replace(new RegExp(`\\s+\\${SHORT_PAUSE_TOKEN}`, "g"), SHORT_PAUSE_TOKEN)
    .replace(new RegExp(`\\${SHORT_PAUSE_TOKEN}\\s+(?=\\[[^\\]]+\\])`, "g"), SHORT_PAUSE_TOKEN)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeSpeakerName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function buildReadableCacheKey(
  sessionId: string,
  readable: SessionReadableContent,
  baseUrl: string,
  referenceId: string,
  normalizedText: string
): string {
  const payload = readable.source === "event" && readable.seq !== undefined
    ? {
      sessionId,
      seq: readable.seq,
      baseUrl,
      referenceId,
      normalizedText,
      format: DEFAULT_TTS_REQUEST_BODY.format
    }
    : {
      sessionId,
      readableId: readable.id,
      baseUrl,
      referenceId,
      normalizedText,
      format: DEFAULT_TTS_REQUEST_BODY.format
    };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function synchsafeInt(buffer: Buffer, offset: number): number {
  return ((buffer[offset] & 0x7f) << 21)
    | ((buffer[offset + 1] & 0x7f) << 14)
    | ((buffer[offset + 2] & 0x7f) << 7)
    | (buffer[offset + 3] & 0x7f);
}

function parseMp3FrameHeader(buffer: Buffer, offset: number): Mp3FrameHeader | null {
  if (offset + 4 > buffer.length) {
    return null;
  }

  const byte0 = buffer[offset];
  const byte1 = buffer[offset + 1];
  const byte2 = buffer[offset + 2];
  const byte3 = buffer[offset + 3];

  if (byte0 !== 0xff || (byte1 & 0xe0) !== 0xe0) {
    return null;
  }

  const versionIndex = (byte1 >> 3) & 0x03;
  const layerIndex = (byte1 >> 1) & 0x03;
  const bitrateIndex = (byte2 >> 4) & 0x0f;
  const sampleRateIndex = (byte2 >> 2) & 0x03;
  const padding = (byte2 >> 1) & 0x01;
  const channelMode = (byte3 >> 6) & 0x03;

  if (versionIndex === 1 || layerIndex === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return null;
  }

  const bitrateKey = versionIndex === 3
    ? layerIndex === 3 ? "V1L1" : layerIndex === 2 ? "V1L2" : "V1L3"
    : layerIndex === 3 ? "V2L1" : "V2L2L3";
  const bitrateKbps = MPEG_BITRATES[bitrateKey]?.[bitrateIndex] ?? 0;
  const sampleRate = MPEG_SAMPLE_RATES[versionIndex]?.[sampleRateIndex] ?? 0;
  if (!bitrateKbps || !sampleRate) {
    return null;
  }

  const samplesPerFrame = layerIndex === 3
    ? 384
    : layerIndex === 2
      ? 1152
      : versionIndex === 3
        ? 1152
        : 576;

  const bitrate = bitrateKbps * 1000;
  let frameLength = 0;
  if (layerIndex === 3) {
    frameLength = Math.floor(((12 * bitrate) / sampleRate + padding) * 4);
  } else if (layerIndex === 1 && versionIndex !== 3) {
    frameLength = Math.floor((72 * bitrate) / sampleRate + padding);
  } else {
    frameLength = Math.floor((144 * bitrate) / sampleRate + padding);
  }

  if (!frameLength) {
    return null;
  }

  return {
    bitrateKbps,
    sampleRate,
    frameLength,
    samplesPerFrame,
    versionIndex,
    layerIndex,
    channelMode
  };
}

function parseMp3DurationFromHeaders(buffer: Buffer, frameOffset: number, header: Mp3FrameHeader): number | undefined {
  const xingOffset = frameOffset + 4 + (
    header.versionIndex === 3
      ? header.channelMode === 3 ? 17 : 32
      : header.channelMode === 3 ? 9 : 17
  );
  if (xingOffset + 12 <= buffer.length) {
    const marker = buffer.toString("ascii", xingOffset, xingOffset + 4);
    if (marker === "Xing" || marker === "Info") {
      const flags = buffer.readUInt32BE(xingOffset + 4);
      if ((flags & 0x1) !== 0 && xingOffset + 12 <= buffer.length) {
        const frameCount = buffer.readUInt32BE(xingOffset + 8);
        if (frameCount > 0) {
          return Math.round((frameCount * header.samplesPerFrame * 1000) / header.sampleRate);
        }
      }
    }
  }

  const vbriOffset = frameOffset + 36;
  if (vbriOffset + 18 <= buffer.length && buffer.toString("ascii", vbriOffset, vbriOffset + 4) === "VBRI") {
    const frameCount = buffer.readUInt32BE(vbriOffset + 14);
    if (frameCount > 0) {
      return Math.round((frameCount * header.samplesPerFrame * 1000) / header.sampleRate);
    }
  }

  return undefined;
}

function findLastTokenBoundary(source: string, token: string, minIndex: number, maxIndex: number): number | undefined {
  const slice = source.slice(0, maxIndex);
  let searchFrom = slice.length;
  while (searchFrom > 0) {
    const index = slice.lastIndexOf(token, searchFrom - 1);
    if (index === -1) {
      return undefined;
    }
    const boundary = index + token.length;
    if (boundary >= minIndex) {
      return boundary;
    }
    searchFrom = index;
  }
  return undefined;
}

function findLastRegexBoundary(source: string, pattern: RegExp, minIndex: number, maxIndex: number): number | undefined {
  const slice = source.slice(0, maxIndex);
  let lastBoundary: number | undefined;
  const globalPattern = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  for (const match of slice.matchAll(globalPattern)) {
    const boundary = (match.index ?? 0) + match[0].length;
    if (boundary >= minIndex) {
      lastBoundary = boundary;
    }
  }
  return lastBoundary;
}

function findBestSplitIndex(source: string, preferredLength: number, overflowChars: number): number {
  const searchLimit = Math.min(source.length, preferredLength + Math.max(0, overflowChars));
  const minBoundary = Math.max(1, Math.floor(preferredLength * 0.5));

  const strongBoundary = findLastTokenBoundary(source, SHORT_PAUSE_TOKEN, minBoundary, searchLimit)
    ?? findLastRegexBoundary(source, /[\n!?！？；;:：]/g, minBoundary, searchLimit);
  if (strongBoundary) {
    return strongBoundary;
  }

  const softBoundary = findLastRegexBoundary(source, /[，,、]/g, minBoundary, searchLimit)
    ?? findLastRegexBoundary(source, /\s+/g, minBoundary, searchLimit);
  if (softBoundary) {
    return softBoundary;
  }

  const tagBoundary = source.lastIndexOf("]", preferredLength - 1);
  if (tagBoundary >= minBoundary) {
    return tagBoundary + 1;
  }

  return preferredLength;
}

function adjustSplitIndexToAvoidBracketTag(source: string, splitIndex: number): number {
  const openingBracketIndex = source.lastIndexOf("[", splitIndex - 1);
  const closingBracketIndex = source.lastIndexOf("]", splitIndex - 1);
  if (openingBracketIndex !== -1 && openingBracketIndex > closingBracketIndex) {
    const matchingBracketIndex = source.indexOf("]", splitIndex);
    if (matchingBracketIndex !== -1) {
      return matchingBracketIndex + 1;
    }
  }
  return splitIndex;
}

export function splitNormalizedTtsText(
  source: string,
  maxSegmentChars = DEFAULT_TTS_SEGMENT_CHAR_LIMIT,
  overflowChars = DEFAULT_TTS_SEGMENT_OVERFLOW_CHARS
): string[] {
  const normalized = source.trim();
  if (!normalized) {
    return [];
  }

  const safeMaxSegmentChars = Math.max(1, maxSegmentChars);
  if (normalized.length <= safeMaxSegmentChars) {
    return [normalized];
  }

  const segments: string[] = [];
  let remaining = normalized;
  while (remaining.length > safeMaxSegmentChars) {
    const splitIndex = findBestSplitIndex(remaining, safeMaxSegmentChars, overflowChars);
    const nextIndex = adjustSplitIndexToAvoidBracketTag(
      remaining,
      splitIndex > 0 ? splitIndex : safeMaxSegmentChars
    );
    const segment = remaining.slice(0, nextIndex).trim();
    if (!segment) {
      break;
    }
    segments.push(segment);
    remaining = remaining.slice(nextIndex).trim();
  }

  if (remaining) {
    segments.push(remaining);
  }

  return segments;
}

function stripLeadingId3v2Tag(buffer: Buffer): Buffer {
  if (buffer.length >= 10 && buffer.toString("ascii", 0, 3) === "ID3") {
    return buffer.subarray(10 + synchsafeInt(buffer, 6));
  }
  return buffer;
}

function stripTrailingId3v1Tag(buffer: Buffer): Buffer {
  if (buffer.length >= ID3_V1_TAG_SIZE && buffer.toString("ascii", buffer.length - ID3_V1_TAG_SIZE, buffer.length - ID3_V1_TAG_SIZE + 3) === "TAG") {
    return buffer.subarray(0, buffer.length - ID3_V1_TAG_SIZE);
  }
  return buffer;
}

function mergeMp3Buffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    return Buffer.alloc(0);
  }
  if (buffers.length === 1) {
    return buffers[0];
  }

  return Buffer.concat(
    buffers.map((buffer, index) => {
      const withoutLeadingTags = index === 0 ? buffer : stripLeadingId3v2Tag(buffer);
      return index < buffers.length - 1 ? stripTrailingId3v1Tag(withoutLeadingTags) : withoutLeadingTags;
    })
  );
}

function isCudaOutOfMemoryMessage(message: string): boolean {
  return /cuda\s+out\s+of\s+memory/i.test(message);
}

export function estimateMp3DurationMs(buffer: Buffer): number | undefined {
  if (buffer.length < 4) {
    return undefined;
  }

  let offset = 0;
  if (buffer.toString("ascii", 0, 3) === "ID3" && buffer.length >= 10) {
    offset = 10 + synchsafeInt(buffer, 6);
  }

  while (offset + 4 <= buffer.length) {
    const header = parseMp3FrameHeader(buffer, offset);
    if (!header) {
      offset += 1;
      continue;
    }

    const headerDuration = parseMp3DurationFromHeaders(buffer, offset, header);
    if (headerDuration) {
      return headerDuration;
    }

    let frameCount = 0;
    let cursor = offset;
    while (cursor + 4 <= buffer.length) {
      const nextHeader = parseMp3FrameHeader(buffer, cursor);
      if (!nextHeader) {
        break;
      }
      frameCount += 1;
      cursor += nextHeader.frameLength;
    }

    if (frameCount > 0) {
      return Math.round((frameCount * header.samplesPerFrame * 1000) / header.sampleRate);
    }

    const audioBytes = buffer.length - offset;
    if (audioBytes > 0 && header.bitrateKbps > 0) {
      return Math.round((audioBytes * 8 * 1000) / (header.bitrateKbps * 1000));
    }

    return undefined;
  }

  return undefined;
}

export class TtsService {
  private readonly cacheDir: string;
  private readonly activeBatchJobs = new Map<string, ActiveBatchJobState>();

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

  async getSessionPerformanceState(sessionId: string): Promise<SessionTtsPerformanceState> {
    const session = await this.store.getSession(sessionId);
    if (!session) {
      throw new HttpError(404, "Session not found");
    }

    const [events, appConfig, storedBatchJob] = await Promise.all([
      this.store.getEvents(sessionId),
      this.store.getAppConfig(),
      this.store.getSessionTtsBatchJob(sessionId)
    ]);

    const readables = buildSessionReadableContents(session, events);
    const preparedItems = readables.map((readable) => this.prepareReadableContent(sessionId, readable, appConfig));
    const cacheMap = await this.loadCacheMap(preparedItems.map((item) => item.cacheKey));
    const batchJob = storedBatchJob ? await this.normalizeStoredBatchJob(storedBatchJob) : null;

    let cachedReadableCount = 0;
    let readyReadableCount = 0;
    const missingVoiceSpeakers = new Set<string>();

    const items = [];
    for (const prepared of preparedItems) {
      const cachedRecord = cacheMap.get(prepared.cacheKey) ?? null;
      const isCached = Boolean(cachedRecord);
      const durationMs = cachedRecord?.durationMs && cachedRecord.durationMs > 0 ? cachedRecord.durationMs : undefined;
      const readyForPlayback = Boolean(isCached && durationMs);
      if (isCached) {
        cachedReadableCount += 1;
      }
      if (readyForPlayback) {
        readyReadableCount += 1;
      }
      if (!prepared.hasVoiceMapping) {
        missingVoiceSpeakers.add(prepared.readable.ttsSpeaker);
      }
      items.push({
        readable: prepared.readable,
        cacheKey: prepared.cacheKey,
        hasVoiceMapping: prepared.hasVoiceMapping,
        referenceId: prepared.referenceId,
        isCached,
        durationMs,
        readyForPlayback
      });
    }

    return sessionTtsPerformanceStateSchema.parse({
      sessionId,
      items,
      ttsBaseUrlConfigured: Boolean(appConfig.tts?.baseUrl?.trim()),
      totalReadableCount: items.length,
      cachedReadableCount,
      readyReadableCount,
      missingReadableCount: Math.max(0, items.length - readyReadableCount),
      missingVoiceSpeakers: Array.from(missingVoiceSpeakers),
      readyForFullPlayback: items.length > 0 && readyReadableCount === items.length && missingVoiceSpeakers.size === 0,
      batchJob
    });
  }

  async startSessionBatchSynthesis(sessionId: string): Promise<SessionTtsPerformanceState> {
    const active = this.activeBatchJobs.get(sessionId);
    const existingJob = await this.store.getSessionTtsBatchJob(sessionId);
    if (active && existingJob?.status === "running") {
      return this.getSessionPerformanceState(sessionId);
    }

    const state = await this.getSessionPerformanceState(sessionId);
    if (!state.ttsBaseUrlConfigured) {
      throw new HttpError(400, "TTS API 地址尚未配置");
    }
    if (state.missingVoiceSpeakers.length > 0) {
      throw new HttpError(400, `以下角色还没有配置 TTS 音色：${state.missingVoiceSpeakers.join("、")}`);
    }

    const pendingReadables = state.items
      .filter((item) => !item.readyForPlayback)
      .map((item) => item.readable);

    if (pendingReadables.length === 0) {
      return state;
    }

    const now = new Date().toISOString();
    await this.store.saveSessionTtsBatchJob({
      sessionId,
      status: "running",
      totalItems: pendingReadables.length,
      completedItems: 0,
      cancelRequested: false,
      startedAt: now,
      updatedAt: now
    });
    this.activeBatchJobs.set(sessionId, {
      cancelRequested: false
    });
    void this.runSessionBatchSynthesis(sessionId, pendingReadables);
    return this.getSessionPerformanceState(sessionId);
  }

  async cancelSessionBatchSynthesis(sessionId: string): Promise<SessionTtsPerformanceState> {
    const job = await this.store.getSessionTtsBatchJob(sessionId);
    if (!job) {
      return this.getSessionPerformanceState(sessionId);
    }

    const now = new Date().toISOString();
    const active = this.activeBatchJobs.get(sessionId);
    if (active && job.status === "running") {
      active.cancelRequested = true;
      await this.store.saveSessionTtsBatchJob({
        ...job,
        cancelRequested: true,
        updatedAt: now
      });
      return this.getSessionPerformanceState(sessionId);
    }

    if (job.status === "running") {
      await this.store.saveSessionTtsBatchJob({
        ...job,
        status: "cancelled",
        cancelRequested: true,
        currentReadableId: undefined,
        currentTitle: undefined,
        updatedAt: now,
        finishedAt: now
      });
    }

    return this.getSessionPerformanceState(sessionId);
  }

  async synthesizeEventAudio(sessionId: string, seq: number): Promise<TtsAudioResult> {
    const event = await this.store.getEvent(sessionId, seq);
    if (!event) {
      throw new HttpError(404, `Session event ${seq} not found`);
    }

    const readable = buildReadableContentFromEvent(event);
    if (!readable) {
      throw new HttpError(400, "Only player messages, character speech, stage direction, and story effect events can be read aloud");
    }

    return this.synthesizeReadableContentAudio(sessionId, readable);
  }

  async synthesizeReadableAudio(sessionId: string, readableId: string): Promise<TtsAudioResult> {
    const readable = await this.getReadableContent(sessionId, readableId);
    return this.synthesizeReadableContentAudio(sessionId, readable);
  }

  private async getReadableContent(sessionId: string, readableId: string): Promise<SessionReadableContent> {
    const session = await this.store.getSession(sessionId);
    if (!session) {
      throw new HttpError(404, "Session not found");
    }

    const events = await this.store.getEvents(sessionId);
    const readable = buildSessionReadableContents(session, events).find((item) => item.id === readableId);
    if (!readable) {
      throw new HttpError(404, `Readable content ${readableId} not found`);
    }

    return readable;
  }

  private async synthesizeReadableContentAudio(
    sessionId: string,
    readable: SessionReadableContent,
    options: {
      requireDuration?: boolean;
    } = {}
  ): Promise<TtsAudioResult> {
    const appConfig = await this.store.getAppConfig();
    const prepared = this.prepareReadableContent(sessionId, readable, appConfig);
    const baseUrl = prepared.baseUrl ? this.requireBaseUrl(prepared.baseUrl) : undefined;
    if (!baseUrl) {
      throw new HttpError(400, "TTS API 地址尚未配置");
    }
    if (!prepared.normalizedText) {
      throw new HttpError(400, "The speech text became empty after TTS normalization");
    }
    if (!prepared.referenceId) {
      throw new HttpError(400, `未找到角色 “${readable.ttsSpeaker}” 对应的 TTS reference_id，请先在设置页配置`);
    }

    const now = new Date().toISOString();
    const cached = await this.hydrateCachedRecord(
      await this.store.getTtsAudioCache(prepared.cacheKey),
      options.requireDuration ?? false
    );
    if (cached) {
      await this.store.touchTtsAudioCache(prepared.cacheKey, now);
      return {
        filePath: cached.filePath,
        mimeType: cached.mimeType,
        cacheHit: true,
        durationMs: cached.durationMs,
        readableId: readable.id
      };
    }

    const { audioBuffer, durationMs } = await this.requestTtsAudioWithChunking(
      baseUrl,
      prepared.normalizedText,
      prepared.referenceId
    );
    if (options.requireDuration && (!durationMs || durationMs <= 0)) {
      throw new HttpError(502, `无法解析条目 “${readable.title}” 的音频时长，无法加入全文播放时间轴`);
    }

    await mkdir(this.cacheDir, { recursive: true });
    const readableLabel = readable.id.replace(/[^a-z0-9_-]+/gi, "-");
    const filePath = path.resolve(this.cacheDir, `${sessionId}-${readableLabel}-${prepared.cacheKey.slice(0, 16)}.mp3`);
    await writeFile(filePath, audioBuffer);

    const record: TtsAudioCacheRecord = {
      key: prepared.cacheKey,
      sessionId,
      readableId: readable.id,
      sourceKind: readable.source,
      eventSeq: readable.seq,
      eventType: readable.eventType,
      speaker: readable.ttsSpeaker,
      referenceId: prepared.referenceId,
      baseUrl,
      sourceText: readable.text,
      normalizedText: prepared.normalizedText,
      filePath,
      mimeType: "audio/mpeg",
      durationMs,
      createdAt: now,
      lastAccessedAt: now
    };
    await this.store.saveTtsAudioCache(record);

    return {
      filePath,
      mimeType: "audio/mpeg",
      cacheHit: false,
      durationMs,
      readableId: readable.id
    };
  }

  private async runSessionBatchSynthesis(sessionId: string, readables: SessionReadableContent[]): Promise<void> {
    const activeJob = this.activeBatchJobs.get(sessionId);
    if (!activeJob) {
      return;
    }

    let completedItems = 0;
    try {
      for (const readable of readables) {
        if (activeJob.cancelRequested) {
          const now = new Date().toISOString();
          await this.store.saveSessionTtsBatchJob({
            sessionId,
            status: "cancelled",
            totalItems: readables.length,
            completedItems,
            cancelRequested: true,
            startedAt: (await this.store.getSessionTtsBatchJob(sessionId))?.startedAt,
            updatedAt: now,
            finishedAt: now
          });
          return;
        }

        await this.store.saveSessionTtsBatchJob({
          sessionId,
          status: "running",
          totalItems: readables.length,
          completedItems,
          currentReadableId: readable.id,
          currentTitle: readable.title,
          cancelRequested: activeJob.cancelRequested,
          startedAt: (await this.store.getSessionTtsBatchJob(sessionId))?.startedAt,
          updatedAt: new Date().toISOString()
        });

        await this.synthesizeReadableContentAudio(sessionId, readable, {
          requireDuration: true
        });
        completedItems += 1;

        await this.store.saveSessionTtsBatchJob({
          sessionId,
          status: "running",
          totalItems: readables.length,
          completedItems,
          currentReadableId: readable.id,
          currentTitle: readable.title,
          cancelRequested: activeJob.cancelRequested,
          startedAt: (await this.store.getSessionTtsBatchJob(sessionId))?.startedAt,
          updatedAt: new Date().toISOString()
        });
      }

      const now = new Date().toISOString();
      await this.store.saveSessionTtsBatchJob({
        sessionId,
        status: "completed",
        totalItems: readables.length,
        completedItems,
        cancelRequested: false,
        startedAt: (await this.store.getSessionTtsBatchJob(sessionId))?.startedAt,
        updatedAt: now,
        finishedAt: now
      });
    } catch (error) {
      const now = new Date().toISOString();
      await this.store.saveSessionTtsBatchJob({
        sessionId,
        status: "failed",
        totalItems: readables.length,
        completedItems,
        currentReadableId: undefined,
        currentTitle: undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
        cancelRequested: activeJob.cancelRequested,
        startedAt: (await this.store.getSessionTtsBatchJob(sessionId))?.startedAt,
        updatedAt: now,
        finishedAt: now
      });
    } finally {
      this.activeBatchJobs.delete(sessionId);
    }
  }

  private prepareReadableContent(
    sessionId: string,
    readable: SessionReadableContent,
    appConfig: AppConfig
  ): PreparedReadableContent {
    const baseUrl = appConfig.tts?.baseUrl?.trim() ? appConfig.tts.baseUrl.replace(/\/+$/, "") : undefined;
    const normalizedText = normalizeTtsText(readable.text);
    const referenceId = baseUrl
      ? this.findReferenceId(readable.ttsSpeaker, appConfig.tts?.roleMappings ?? [])
      : undefined;
    return {
      readable,
      cacheKey: buildReadableCacheKey(sessionId, readable, baseUrl ?? "", referenceId ?? "", normalizedText),
      normalizedText,
      baseUrl,
      referenceId,
      hasVoiceMapping: Boolean(baseUrl && referenceId && normalizedText)
    };
  }

  private findReferenceId(
    speaker: string,
    mappings: TtsRoleMapping[]
  ): string | undefined {
    const normalizedSpeaker = normalizeSpeakerName(speaker);
    if (!normalizedSpeaker) {
      return undefined;
    }

    const exactMatch = mappings.find((mapping) => normalizeSpeakerName(mapping.characterName) === normalizedSpeaker);
    return exactMatch?.referenceId.trim() || undefined;
  }

  private async loadCacheMap(keys: string[]): Promise<Map<string, TtsAudioCacheRecord>> {
    const records = await this.store.getTtsAudioCaches(keys);
    const hydratedRecords = await Promise.all(records.map(async (record) => this.hydrateCachedRecord(record, false)));
    return new Map(
      hydratedRecords
        .filter((record): record is TtsAudioCacheRecord => Boolean(record))
        .map((record) => [record.key, record])
    );
  }

  private async hydrateCachedRecord(
    record: TtsAudioCacheRecord | null,
    requireDuration: boolean
  ): Promise<TtsAudioCacheRecord | null> {
    if (!record || !await this.fileExists(record.filePath)) {
      return null;
    }

    if (record.durationMs && record.durationMs > 0) {
      return record;
    }

    const buffer = await readFile(record.filePath);
    const durationMs = estimateMp3DurationMs(buffer);
    if (!durationMs || durationMs <= 0) {
      return requireDuration ? null : record;
    }

    const updatedRecord = {
      ...record,
      durationMs
    };
    await this.store.saveTtsAudioCache(updatedRecord);
    return updatedRecord;
  }

  private async normalizeStoredBatchJob(job: SessionTtsBatchJob): Promise<SessionTtsBatchJob> {
    if (job.status !== "running" || this.activeBatchJobs.has(job.sessionId)) {
      return job;
    }

    const now = new Date().toISOString();
    const interruptedJob: SessionTtsBatchJob = {
      ...job,
      status: "interrupted",
      currentReadableId: undefined,
      currentTitle: undefined,
      errorMessage: job.errorMessage ?? "批量任务在服务重启或异常后中断了。",
      updatedAt: now,
      finishedAt: now
    };
    await this.store.saveSessionTtsBatchJob(interruptedJob);
    return interruptedJob;
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

  private async requestTtsAudioWithChunking(
    baseUrl: string,
    text: string,
    referenceId: string,
    maxSegmentChars = DEFAULT_TTS_SEGMENT_CHAR_LIMIT
  ): Promise<{ audioBuffer: Buffer; durationMs?: number }> {
    const segments = splitNormalizedTtsText(text, maxSegmentChars);

    try {
      if (segments.length === 1) {
        const audioBuffer = await this.requestTtsAudio(baseUrl, segments[0]!, referenceId);
        return {
          audioBuffer,
          durationMs: estimateMp3DurationMs(audioBuffer)
        };
      }

      return await this.requestTtsAudioSegments(baseUrl, segments, referenceId);
    } catch (error) {
      if (!this.isCudaOutOfMemoryError(error)) {
        throw error;
      }

      const retryLimit = this.getRetrySegmentCharLimit(text.length, maxSegmentChars);
      if (!retryLimit) {
        throw error;
      }

      return this.requestTtsAudioWithChunking(baseUrl, text, referenceId, retryLimit);
    }
  }

  private async requestTtsAudioSegments(
    baseUrl: string,
    segments: string[],
    referenceId: string
  ): Promise<{ audioBuffer: Buffer; durationMs?: number }> {
    const buffers: Buffer[] = [];
    let totalDurationMs = 0;
    let hasCompleteDuration = true;

    for (const segment of segments) {
      const audioBuffer = await this.requestTtsAudio(baseUrl, segment, referenceId);
      buffers.push(audioBuffer);

      const durationMs = estimateMp3DurationMs(audioBuffer);
      if (durationMs && durationMs > 0) {
        totalDurationMs += durationMs;
      } else {
        hasCompleteDuration = false;
      }
    }

    const mergedBuffer = mergeMp3Buffers(buffers);
    return {
      audioBuffer: mergedBuffer,
      durationMs: hasCompleteDuration ? totalDurationMs : estimateMp3DurationMs(mergedBuffer)
    };
  }

  private getRetrySegmentCharLimit(textLength: number, currentLimit: number): number | undefined {
    if (currentLimit <= MIN_TTS_SEGMENT_CHAR_LIMIT) {
      return undefined;
    }

    const nextLimit = Math.max(
      MIN_TTS_SEGMENT_CHAR_LIMIT,
      Math.min(Math.floor(currentLimit * 0.6), Math.max(MIN_TTS_SEGMENT_CHAR_LIMIT, Math.floor(textLength / 2)))
    );
    return nextLimit < currentLimit ? nextLimit : undefined;
  }

  private isCudaOutOfMemoryError(error: unknown): boolean {
    if (error instanceof HttpError) {
      return isCudaOutOfMemoryMessage(error.message);
    }
    return error instanceof Error && isCudaOutOfMemoryMessage(error.message);
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
