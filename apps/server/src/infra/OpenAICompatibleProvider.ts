import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";
import type { LlmConfig } from "@dglab-ai/shared";
import { createId } from "../lib/ids.js";
import type { ChatMessage, LLMProvider, LlmCallStore, ProviderUsage } from "../types/contracts.js";

type CompletionPayload = {
  choices: Array<{
    message: {
      content?: string | Array<{
        type?: string;
        text?: string;
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

type CompletionChunkPayload = {
  choices?: Array<{
    delta?: {
      content?: string | Array<{
        type?: string;
        text?: string;
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: CompletionPayload["usage"];
};

type StreamedTextResult = {
  rawText: string;
  usage?: CompletionPayload["usage"];
  reasoningSummary?: string;
};

type ChatCompletionRequestBody = {
  model: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  messages: ChatMessage[];
  reasoning_effort?: LlmConfig["reasoningEffort"];
  stream?: boolean;
  stream_options?: {
    include_usage: boolean;
  };
  response_format?: {
    type: "json_schema";
    json_schema: {
      name: string;
      strict: true;
      schema: ReturnType<typeof zodToJsonSchema>;
    };
  };
};

type ResponsesRequestBody = {
  model: string;
  input: Array<{
    role: ChatMessage["role"];
    content: Array<{
      type: "input_text";
      text: string;
    }>;
  }>;
  temperature: number;
  top_p: number;
  max_output_tokens: number;
  stream: true;
  reasoning: {
    effort: LlmConfig["reasoningEffort"];
    summary: "auto";
  };
};

type ResponsesUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

type ResponsesOutputItem = {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  summary?: Array<{
    type?: string;
    text?: string;
  }>;
};

type ResponsesPayload = {
  output_text?: string;
  output?: ResponsesOutputItem[];
  usage?: ResponsesUsage;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

type ResponsesStreamEventPayload = {
  type?: string;
  delta?: string;
  text?: string;
  part?: {
    text?: string;
  };
  summary_index?: number;
  response?: ResponsesPayload;
};

class ResponsesApiUnsupportedError extends Error {}

function debugLog(label: string, payload: unknown): void {
  if (process.env.DEBUG_LLM !== "1") {
    return;
  }
  console.log(`[LLM DEBUG] ${label}`);
  if (typeof payload === "string") {
    console.log(payload);
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

function normalizeContent(
  content: string | Array<{ type?: string; text?: string }> | undefined
): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => item.text ?? "")
      .join("");
  }
  return "";
}

function normalizeResponsesOutputText(payload: ResponsesPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text) {
    return payload.output_text;
  }

  return (payload.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "")
    .join("");
}

function normalizeResponsesReasoningSummary(payload: ResponsesPayload): string {
  return (payload.output ?? [])
    .filter((item) => item.type === "reasoning")
    .flatMap((item) => item.summary ?? [])
    .map((item) => item.text ?? "")
    .filter(Boolean)
    .join("\n\n");
}

function parseCompletionPayload(responseText: string): CompletionPayload {
  try {
    return JSON.parse(responseText) as CompletionPayload;
  } catch (error) {
    if (!/^\s*data:/m.test(responseText)) {
      const parseError = error instanceof Error ? error.message : String(error);
      debugLog("raw_http_response", responseText);
      throw new Error(
        `Provider returned non-JSON response body: ${parseError}`
      );
    }
    try {
      return parseSseCompletionPayload(responseText);
    } catch (sseError) {
      debugLog("raw_http_response", responseText);
      throw sseError;
    }
  }
}

function parseSseCompletionPayload(responseText: string): CompletionPayload {
  const contentParts: string[] = [];
  let usage: CompletionPayload["usage"];
  let sawChunk = false;

  for (const line of responseText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      continue;
    }
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") {
      continue;
    }
    const chunk = JSON.parse(data) as CompletionChunkPayload;
    sawChunk = true;
    const deltaContent = normalizeContent(chunk.choices?.[0]?.delta?.content);
    if (deltaContent) {
      contentParts.push(deltaContent);
    }
    if (chunk.usage) {
      usage = chunk.usage;
    }
  }

  if (!sawChunk) {
    throw new Error("Provider returned SSE response without any data chunks");
  }

  return {
    choices: [
      {
        message: {
          content: contentParts.join("")
        }
      }
    ],
    usage
  };
}

function extractSseDataBlocks(source: string): { blocks: string[]; remainder: string } {
  const normalized = source.replace(/\r\n/g, "\n");
  const blocks: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const separatorIndex = normalized.indexOf("\n\n", cursor);
    if (separatorIndex === -1) {
      break;
    }
    blocks.push(normalized.slice(cursor, separatorIndex));
    cursor = separatorIndex + 2;
  }

  return {
    blocks,
    remainder: normalized.slice(cursor)
  };
}

function parseSseEventBlock(block: string): { event?: string; data: string } {
  let eventName: string | undefined;
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  return {
    event: eventName,
    data: dataLines.join("\n").trim()
  };
}

function processSseBlock(
  block: string,
  state: { contentParts: string[]; usage?: CompletionPayload["usage"]; sawChunk: boolean },
  onTextDelta?: (delta: string) => void
): void {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n")
    .trim();

  if (!data || data === "[DONE]") {
    return;
  }

  const chunk = JSON.parse(data) as CompletionChunkPayload;
  state.sawChunk = true;
  const deltaContent = normalizeContent(chunk.choices?.[0]?.delta?.content);
  if (deltaContent) {
    state.contentParts.push(deltaContent);
    onTextDelta?.(deltaContent);
  }
  if (chunk.usage) {
    state.usage = chunk.usage;
  }
}

async function readStreamedTextResponse(
  response: Response,
  onTextDelta?: (delta: string) => void
): Promise<StreamedTextResult> {
  if (!response.body) {
    const responseText = await response.text();
    const payload = parseCompletionPayload(responseText);
    const rawText = normalizeContent(payload.choices?.[0]?.message?.content);
    if (rawText) {
      onTextDelta?.(rawText);
    }
    return {
      rawText,
      usage: payload.usage
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!/text\/event-stream/i.test(contentType)) {
    const responseText = await response.text();
    const payload = parseCompletionPayload(responseText);
    const rawText = normalizeContent(payload.choices?.[0]?.message?.content);
    if (rawText) {
      onTextDelta?.(rawText);
    }
    return {
      rawText,
      usage: payload.usage
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state: { contentParts: string[]; usage?: CompletionPayload["usage"]; sawChunk: boolean } = {
    contentParts: [],
    sawChunk: false
  };
  let pending = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    pending += decoder.decode(value, { stream: true });
    const parsed = extractSseDataBlocks(pending);
    pending = parsed.remainder;
    for (const block of parsed.blocks) {
      processSseBlock(block, state, onTextDelta);
    }
  }

  pending += decoder.decode();
  if (pending.trim()) {
    const parsed = extractSseDataBlocks(`${pending}\n\n`);
    for (const block of parsed.blocks) {
      processSseBlock(block, state, onTextDelta);
    }
  }

  if (!state.sawChunk) {
    throw new Error("Provider returned SSE response without any data chunks");
  }

  return {
    rawText: state.contentParts.join(""),
    usage: state.usage
  };
}

function stripReasoningBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function findFirstBalancedJsonObject(text: string): string | null {
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") {
      continue;
    }
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaping) {
          escaping = false;
          continue;
        }
        if (char === "\\") {
          escaping = true;
          continue;
        }
        if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }
      if (char === "{") {
        depth += 1;
        continue;
      }
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return text.slice(start, index + 1);
        }
      }
    }
  }

  return null;
}

function extractJsonObject(text: string): string {
  const trimmed = stripReasoningBlocks(text);
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const balanced = findFirstBalancedJsonObject(trimmed);
    if (balanced) {
      return balanced;
    }
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const balanced = findFirstBalancedJsonObject(fenced[1].trim());
    if (balanced) {
      return balanced;
    }
  }
  const balanced = findFirstBalancedJsonObject(trimmed);
  if (balanced) {
    return balanced;
  }
  throw new Error("Provider returned non-JSON content");
}

function buildUsage(model: string, payload: CompletionPayload): ProviderUsage {
  return {
    promptTokens: payload.usage?.prompt_tokens ?? 0,
    completionTokens: payload.usage?.completion_tokens ?? 0,
    totalTokens: payload.usage?.total_tokens ?? 0,
    calls: 1,
    lastModel: model,
    lastUpdatedAt: new Date().toISOString(),
    model
  };
}

function buildUsageFromResponses(model: string, usage?: ResponsesUsage): ProviderUsage {
  return {
    promptTokens: usage?.input_tokens ?? 0,
    completionTokens: usage?.output_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
    calls: 1,
    lastModel: model,
    lastUpdatedAt: new Date().toISOString(),
    model
  };
}

function buildChatCompletionBody(
  modelConfig: LlmConfig,
  messages: ChatMessage[],
  extra: Omit<ChatCompletionRequestBody, "model" | "temperature" | "max_tokens" | "top_p" | "messages" | "reasoning_effort"> = {}
): ChatCompletionRequestBody {
  return {
    model: modelConfig.model,
    temperature: modelConfig.temperature,
    max_tokens: modelConfig.maxTokens,
    top_p: modelConfig.topP,
    reasoning_effort: modelConfig.reasoningEffort,
    messages,
    ...extra
  };
}

function buildResponsesBody(modelConfig: LlmConfig, messages: ChatMessage[]): ResponsesRequestBody {
  return {
    model: modelConfig.model,
    input: messages.map((message) => ({
      role: message.role,
      content: [
        {
          type: "input_text",
          text: message.content
        }
      ]
    })),
    temperature: modelConfig.temperature,
    top_p: modelConfig.topP,
    max_output_tokens: modelConfig.maxTokens,
    stream: true,
    reasoning: {
      effort: modelConfig.reasoningEffort,
      summary: "auto"
    }
  };
}

function isUnsupportedStructuredOutput(status: number, errorText: string): boolean {
  return status === 400
    && /response_format type is unavailable|json_schema|response_format/i.test(errorText);
}

function isUnsupportedReasoningEffort(status: number, errorText: string): boolean {
  if (status < 400 || status >= 500) {
    return false;
  }

  return /reasoning[_ ]effort/i.test(errorText)
    && /unknown|unexpected|unsupported|not supported|not allowed|extra inputs|additional propert|unrecognized|invalid/i.test(errorText);
}

async function postChatCompletion(
  endpoint: string,
  headers: Record<string, string>,
  body: ChatCompletionRequestBody,
  signal: AbortSignal
): Promise<{ response: Response; errorText?: string }> {
  const send = (requestBody: ChatCompletionRequestBody) => fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
    signal
  });

  let response = await send(body);
  if (response.ok || body.reasoning_effort === undefined) {
    return { response };
  }

  let errorText = await response.text();
  if (!isUnsupportedReasoningEffort(response.status, errorText)) {
    return { response, errorText };
  }

  debugLog("reasoning_effort_unsupported_retry", {
    endpoint,
    model: body.model,
    reasoningEffort: body.reasoning_effort,
    body: errorText
  });

  const { reasoning_effort: _reasoningEffort, ...fallbackBody } = body;
  response = await send(fallbackBody);
  if (response.ok) {
    return { response };
  }

  errorText = await response.text();
  return { response, errorText };
}

function isUnsupportedResponsesRequest(status: number, errorText: string): boolean {
  if (status === 404 || status === 405 || status === 501) {
    return true;
  }
  if (status < 400 || status >= 500) {
    return false;
  }

  return /responses|reasoning|summary|max_output_tokens|input_text|unknown url|unknown endpoint|not found|unsupported|not supported|unexpected|unrecognized|extra inputs|additional propert|invalid/i.test(errorText);
}

function appendReasoningSummaryDelta(
  state: {
    summaryParts: Map<number, string>;
    sawSummary: boolean;
    streamedSummaryIndexes: Set<number>;
  },
  summaryIndex: number,
  delta: string,
  onReasoningSummaryDelta?: (delta: string) => void
): void {
  const hasExistingPart = state.summaryParts.has(summaryIndex);
  const previous = state.summaryParts.get(summaryIndex) ?? "";
  state.summaryParts.set(summaryIndex, `${previous}${delta}`);
  state.sawSummary = true;
  if (!state.streamedSummaryIndexes.has(summaryIndex)) {
    state.streamedSummaryIndexes.add(summaryIndex);
    if (hasExistingPart || summaryIndex > 0) {
      onReasoningSummaryDelta?.("\n\n");
    }
  }
  onReasoningSummaryDelta?.(delta);
}

function completeReasoningSummaryPart(
  state: {
    summaryParts: Map<number, string>;
    sawSummary: boolean;
    streamedSummaryIndexes: Set<number>;
  },
  summaryIndex: number,
  text: string,
  onReasoningSummaryDelta?: (delta: string) => void
): void {
  const alreadyStreamed = state.streamedSummaryIndexes.has(summaryIndex);
  state.summaryParts.set(summaryIndex, text);
  if (alreadyStreamed || !text) {
    return;
  }
  state.sawSummary = true;
  state.streamedSummaryIndexes.add(summaryIndex);
  if (summaryIndex > 0) {
    onReasoningSummaryDelta?.("\n\n");
  }
  onReasoningSummaryDelta?.(text);
}

function finalizeReasoningSummary(summaryParts: Map<number, string>): string {
  return Array.from(summaryParts.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, text]) => text)
    .filter(Boolean)
    .join("\n\n");
}

function processResponsesSseBlock(
  block: string,
  state: {
    contentParts: string[];
    summaryParts: Map<number, string>;
    streamedSummaryIndexes: Set<number>;
    usage?: ResponsesUsage;
    sawText: boolean;
    sawSummary: boolean;
  },
  onTextDelta?: (delta: string) => void,
  onReasoningSummaryDelta?: (delta: string) => void
): void {
  const { event, data } = parseSseEventBlock(block);
  if (!data || data === "[DONE]") {
    return;
  }

  const payload = JSON.parse(data) as ResponsesStreamEventPayload;
  const eventType = event ?? payload.type ?? "";

  if (eventType === "response.output_text.delta") {
    const delta = typeof payload.delta === "string" ? payload.delta : "";
    if (delta) {
      state.contentParts.push(delta);
      state.sawText = true;
      onTextDelta?.(delta);
    }
    return;
  }

  if (eventType === "response.output_text.done") {
    const text = typeof payload.text === "string" ? payload.text : "";
    if (text && !state.sawText) {
      state.contentParts.push(text);
      onTextDelta?.(text);
    }
    return;
  }

  if (eventType === "response.reasoning_summary_text.delta") {
    const delta = typeof payload.delta === "string" ? payload.delta : "";
    if (delta) {
      appendReasoningSummaryDelta(
        state,
        typeof payload.summary_index === "number" ? payload.summary_index : 0,
        delta,
        onReasoningSummaryDelta
      );
    }
    return;
  }

  if (eventType === "response.reasoning_summary_text.done") {
    const text = typeof payload.text === "string"
      ? payload.text
      : typeof payload.part?.text === "string"
        ? payload.part.text
        : "";
    completeReasoningSummaryPart(
      state,
      typeof payload.summary_index === "number" ? payload.summary_index : 0,
      text,
      onReasoningSummaryDelta
    );
    return;
  }

  if (eventType === "response.completed" && payload.response) {
    const finalText = normalizeResponsesOutputText(payload.response);
    if (finalText && !state.sawText) {
      state.contentParts.push(finalText);
      onTextDelta?.(finalText);
      state.sawText = true;
    }
    const finalSummary = normalizeResponsesReasoningSummary(payload.response);
    if (finalSummary && !state.sawSummary) {
      completeReasoningSummaryPart(state, 0, finalSummary, onReasoningSummaryDelta);
    }
    if (payload.response.usage) {
      state.usage = payload.response.usage;
    }
  }
}

async function readResponsesStreamResponse(
  response: Response,
  onTextDelta?: (delta: string) => void,
  onReasoningSummaryDelta?: (delta: string) => void
): Promise<StreamedTextResult> {
  if (!response.body) {
    const responseText = await response.text();
    const payload = JSON.parse(responseText) as ResponsesPayload;
    const rawText = normalizeResponsesOutputText(payload);
    const reasoningSummary = normalizeResponsesReasoningSummary(payload);
    if (rawText) {
      onTextDelta?.(rawText);
    }
    if (reasoningSummary) {
      onReasoningSummaryDelta?.(reasoningSummary);
    }
    return {
      rawText,
      reasoningSummary,
      usage: {
        prompt_tokens: payload.usage?.input_tokens,
        completion_tokens: payload.usage?.output_tokens,
        total_tokens: payload.usage?.total_tokens
      }
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!/text\/event-stream/i.test(contentType)) {
    const responseText = await response.text();
    const payload = JSON.parse(responseText) as ResponsesPayload;
    const rawText = normalizeResponsesOutputText(payload);
    const reasoningSummary = normalizeResponsesReasoningSummary(payload);
    if (rawText) {
      onTextDelta?.(rawText);
    }
    if (reasoningSummary) {
      onReasoningSummaryDelta?.(reasoningSummary);
    }
    return {
      rawText,
      reasoningSummary,
      usage: {
        prompt_tokens: payload.usage?.input_tokens,
        completion_tokens: payload.usage?.output_tokens,
        total_tokens: payload.usage?.total_tokens
      }
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state: {
    contentParts: string[];
    summaryParts: Map<number, string>;
    streamedSummaryIndexes: Set<number>;
    usage?: ResponsesUsage;
    sawText: boolean;
    sawSummary: boolean;
  } = {
    contentParts: [],
    summaryParts: new Map(),
    streamedSummaryIndexes: new Set(),
    sawText: false,
    sawSummary: false
  };
  let pending = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    pending += decoder.decode(value, { stream: true });
    const parsed = extractSseDataBlocks(pending);
    pending = parsed.remainder;
    for (const block of parsed.blocks) {
      processResponsesSseBlock(block, state, onTextDelta, onReasoningSummaryDelta);
    }
  }

  pending += decoder.decode();
  if (pending.trim()) {
    const parsed = extractSseDataBlocks(`${pending}\n\n`);
    for (const block of parsed.blocks) {
      processResponsesSseBlock(block, state, onTextDelta, onReasoningSummaryDelta);
    }
  }

  return {
    rawText: state.contentParts.join(""),
    reasoningSummary: finalizeReasoningSummary(state.summaryParts),
    usage: {
      prompt_tokens: state.usage?.input_tokens,
      completion_tokens: state.usage?.output_tokens,
      total_tokens: state.usage?.total_tokens
    }
  };
}

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(private readonly llmCallStore?: Pick<LlmCallStore, "recordLlmCall">) {}

  async streamText({
    modelConfig,
    messages,
    usageContext,
    onTextDelta,
    onReasoningSummaryDelta
  }: {
    modelConfig: LlmConfig;
    messages: ChatMessage[];
    usageContext: Record<string, unknown>;
    onTextDelta?: (delta: string) => void;
    onReasoningSummaryDelta?: (delta: string) => void;
  }): Promise<{ usage: ProviderUsage; rawText: string; reasoningSummary?: string }> {
    const effectiveTimeoutMs = Math.max(modelConfig.requestTimeoutMs, 120000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);
    const startedAt = new Date().toISOString();
    let usage: ProviderUsage | undefined;

    const recordCall = async (status: "success" | "error", errorMessage?: string | null) => {
      if (!this.llmCallStore) {
        return;
      }

      try {
        const finishedAt = new Date().toISOString();
        const kind = typeof usageContext.kind === "string" && usageContext.kind.trim()
          ? usageContext.kind
          : "unknown";
        const sessionId = typeof usageContext.sessionId === "string" && usageContext.sessionId.trim()
          ? usageContext.sessionId
          : undefined;
        await this.llmCallStore.recordLlmCall({
          id: createId("llm_call"),
          provider: modelConfig.provider,
          model: modelConfig.model,
          kind,
          schemaName: "stream_text",
          status,
          startedAt,
          finishedAt,
          durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
          promptTokens: usage?.promptTokens ?? 0,
          completionTokens: usage?.completionTokens ?? 0,
          totalTokens: usage?.totalTokens ?? 0,
          sessionId,
          context: usageContext,
          errorMessage: errorMessage ?? null
        });
      } catch (recordError) {
        console.error("Failed to persist LLM call record", recordError);
      }
    };

    try {
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${modelConfig.apiKey}`
      };
      try {
        const responsesEndpoint = `${modelConfig.baseUrl.replace(/\/$/, "")}/responses`;
        const responsesBody = buildResponsesBody(modelConfig, messages);

        debugLog("request", {
          endpoint: responsesEndpoint,
          model: modelConfig.model,
          strategy: "responses_stream_text",
          reasoningEffort: modelConfig.reasoningEffort,
          messages
        });

        const response = await fetch(responsesEndpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(responsesBody),
          signal: controller.signal
        });

        if (!response.ok) {
          const errorText = await response.text();
          debugLog("responses_stream_error", {
            status: response.status,
            body: errorText
          });
          if (isUnsupportedResponsesRequest(response.status, errorText)) {
            throw new ResponsesApiUnsupportedError(errorText);
          }
          throw new Error(`Provider responses stream request failed: ${response.status} ${errorText}`);
        }

        const streamed = await readResponsesStreamResponse(response, onTextDelta, onReasoningSummaryDelta);
        usage = buildUsageFromResponses(modelConfig.model, {
          input_tokens: streamed.usage?.prompt_tokens,
          output_tokens: streamed.usage?.completion_tokens,
          total_tokens: streamed.usage?.total_tokens
        });
        debugLog("raw_content", streamed.rawText);
        debugLog("reasoning_summary", streamed.reasoningSummary);
        await recordCall("success");
        return {
          rawText: streamed.rawText,
          reasoningSummary: streamed.reasoningSummary,
          usage
        };
      } catch (error) {
        if (!(error instanceof ResponsesApiUnsupportedError)) {
          throw error;
        }
        debugLog("responses_stream_fallback", {
          model: modelConfig.model,
          reason: error.message
        });
      }

      const endpoint = `${modelConfig.baseUrl.replace(/\/$/, "")}/chat/completions`;
      const requestBody = buildChatCompletionBody(modelConfig, messages, {
        stream: true,
        stream_options: {
          include_usage: true
        }
      });

      debugLog("request", {
        endpoint,
        model: modelConfig.model,
        strategy: "chat_completions_stream_text",
        reasoningEffort: modelConfig.reasoningEffort,
        messages
      });

      const { response, errorText } = await postChatCompletion(
        endpoint,
        headers,
        requestBody,
        controller.signal
      );

      if (!response.ok) {
        debugLog("stream_error", {
          status: response.status,
          body: errorText
        });
        throw new Error(`Provider stream request failed: ${response.status} ${errorText}`);
      }

      const streamed = await readStreamedTextResponse(response, onTextDelta);
      usage = buildUsage(modelConfig.model, {
        choices: [
          {
            message: {
              content: streamed.rawText
            }
          }
        ],
        usage: streamed.usage
      });
      debugLog("raw_content", streamed.rawText);
      await recordCall("success");
      return {
        rawText: streamed.rawText,
        reasoningSummary: undefined,
        usage
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        const timeoutError = new Error(
          `Provider request timed out after ${effectiveTimeoutMs}ms for model ${modelConfig.model}`
        );
        await recordCall("error", timeoutError.message);
        throw timeoutError;
      }
      await recordCall("error", error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async completeJson<T>({
    modelConfig,
    messages,
    schema,
    schemaName,
    usageContext
  }: {
    modelConfig: LlmConfig;
    messages: ChatMessage[];
    schema: z.ZodSchema<T>;
    schemaName: string;
    usageContext: Record<string, unknown>;
  }): Promise<{ data: T; usage: ProviderUsage; rawText: string }> {
    const effectiveTimeoutMs = Math.max(modelConfig.requestTimeoutMs, 120000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);
    const startedAt = new Date().toISOString();
    let usage: ProviderUsage | undefined;

    const recordCall = async (status: "success" | "error", errorMessage?: string | null) => {
      if (!this.llmCallStore) {
        return;
      }

      try {
        const finishedAt = new Date().toISOString();
        const kind = typeof usageContext.kind === "string" && usageContext.kind.trim()
          ? usageContext.kind
          : "unknown";
        const sessionId = typeof usageContext.sessionId === "string" && usageContext.sessionId.trim()
          ? usageContext.sessionId
          : undefined;
        await this.llmCallStore.recordLlmCall({
          id: createId("llm_call"),
          provider: modelConfig.provider,
          model: modelConfig.model,
          kind,
          schemaName,
          status,
          startedAt,
          finishedAt,
          durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
          promptTokens: usage?.promptTokens ?? 0,
          completionTokens: usage?.completionTokens ?? 0,
          totalTokens: usage?.totalTokens ?? 0,
          sessionId,
          context: usageContext,
          errorMessage: errorMessage ?? null
        });
      } catch (recordError) {
        console.error("Failed to persist LLM call record", recordError);
      }
    };

    try {
      const endpoint = `${modelConfig.baseUrl.replace(/\/$/, "")}/chat/completions`;
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${modelConfig.apiKey}`
      };
      const structuredBody = buildChatCompletionBody(modelConfig, messages, {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            strict: true,
            schema: zodToJsonSchema(schema, schemaName)
          }
        }
      });
      debugLog("request", {
        endpoint,
        model: modelConfig.model,
        schemaName,
        strategy: "json_schema",
        reasoningEffort: modelConfig.reasoningEffort,
        messages
      });
      let { response, errorText } = await postChatCompletion(
        endpoint,
        headers,
        structuredBody,
        controller.signal
      );

      if (!response.ok) {
        debugLog("json_schema_error", {
          status: response.status,
          body: errorText
        });
        const unsupportedStructuredOutput = errorText
          ? isUnsupportedStructuredOutput(response.status, errorText)
          : false;
        if (!unsupportedStructuredOutput) {
          throw new Error(`Provider request failed: ${response.status} ${errorText}`);
        }
        const fallbackMessages: ChatMessage[] = [
          ...messages,
          {
            role: "system",
            content: [
              "Return only one valid JSON object.",
              "Do not use markdown fences.",
              `The JSON must match schema name "${schemaName}".`,
              `JSON schema: ${JSON.stringify(zodToJsonSchema(schema, schemaName))}`
            ].join("\n")
          }
        ];
        const fallbackBody = buildChatCompletionBody(modelConfig, fallbackMessages);
        ({ response, errorText } = await postChatCompletion(
          endpoint,
          headers,
          fallbackBody,
          controller.signal
        ));
        debugLog("request", {
          endpoint,
          model: modelConfig.model,
          schemaName,
          strategy: "prompted_json_fallback",
          reasoningEffort: modelConfig.reasoningEffort,
          messages: fallbackMessages
        });
        if (!response.ok) {
          debugLog("fallback_error", {
            status: response.status,
            body: errorText
          });
          throw new Error(`Provider fallback request failed: ${response.status} ${errorText}`);
        }
      }

      const responseText = await response.text();
      const payload = parseCompletionPayload(responseText);
      usage = buildUsage(modelConfig.model, payload);
      const rawText = normalizeContent(payload.choices?.[0]?.message?.content);
      debugLog("raw_response", payload);
      debugLog("raw_content", rawText);
      const jsonText = extractJsonObject(rawText);
      debugLog("parsed_json_text", jsonText);
      const parsedJson = JSON.parse(jsonText);
      const data = schema.parse(parsedJson);
      debugLog("validated_data", data);
      await recordCall("success");
      return {
        data,
        rawText: jsonText,
        usage
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        debugLog("abort", {
          endpoint: `${modelConfig.baseUrl.replace(/\/$/, "")}/chat/completions`,
          model: modelConfig.model,
          schemaName,
          timeoutMs: effectiveTimeoutMs
        });
        const timeoutError = new Error(
          `Provider request timed out after ${effectiveTimeoutMs}ms for model ${modelConfig.model}`
        );
        await recordCall("error", timeoutError.message);
        throw timeoutError;
      }
      await recordCall("error", error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
