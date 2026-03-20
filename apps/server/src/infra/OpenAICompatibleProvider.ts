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
};

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

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(private readonly llmCallStore?: Pick<LlmCallStore, "recordLlmCall">) {}

  async streamText({
    modelConfig,
    messages,
    usageContext,
    onTextDelta
  }: {
    modelConfig: LlmConfig;
    messages: ChatMessage[];
    usageContext: Record<string, unknown>;
    onTextDelta?: (delta: string) => void;
  }): Promise<{ usage: ProviderUsage; rawText: string }> {
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
      const endpoint = `${modelConfig.baseUrl.replace(/\/$/, "")}/chat/completions`;
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${modelConfig.apiKey}`
      };
      const requestBody = {
        model: modelConfig.model,
        temperature: modelConfig.temperature,
        max_tokens: modelConfig.maxTokens,
        top_p: modelConfig.topP,
        stream: true,
        stream_options: {
          include_usage: true
        },
        messages
      };

      debugLog("request", {
        endpoint,
        model: modelConfig.model,
        strategy: "stream_text",
        messages
      });

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
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
      const structuredBody = {
        model: modelConfig.model,
        temperature: modelConfig.temperature,
        max_tokens: modelConfig.maxTokens,
        top_p: modelConfig.topP,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            strict: true,
            schema: zodToJsonSchema(schema, schemaName)
          }
        }
      };
      debugLog("request", {
        endpoint,
        model: modelConfig.model,
        schemaName,
        strategy: "json_schema",
        messages
      });
      let response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(structuredBody),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        debugLog("json_schema_error", {
          status: response.status,
          body: errorText
        });
        const unsupportedStructuredOutput = response.status === 400
          && /response_format type is unavailable|json_schema|response_format/i.test(errorText);
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
        response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: modelConfig.model,
            temperature: modelConfig.temperature,
            max_tokens: modelConfig.maxTokens,
            top_p: modelConfig.topP,
            messages: fallbackMessages
          }),
          signal: controller.signal
        });
        debugLog("request", {
          endpoint,
          model: modelConfig.model,
          schemaName,
          strategy: "prompted_json_fallback",
          messages: fallbackMessages
        });
        if (!response.ok) {
          const fallbackErrorText = await response.text();
          debugLog("fallback_error", {
            status: response.status,
            body: fallbackErrorText
          });
          throw new Error(`Provider fallback request failed: ${response.status} ${fallbackErrorText}`);
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
