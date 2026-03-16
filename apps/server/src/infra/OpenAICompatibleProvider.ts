import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";
import type { ChatMessage, LLMProvider, ProviderUsage } from "../types/contracts.js";

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
      throw new Error(
        `Provider returned non-JSON response body: ${parseError}`
      );
    }
    return parseSseCompletionPayload(responseText);
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

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
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
  async completeJson<T>({
    modelConfig,
    messages,
    schema,
    schemaName
  }: {
    modelConfig: {
      baseUrl: string;
      apiKey: string;
      model: string;
      temperature: number;
      maxTokens: number;
      topP: number;
      requestTimeoutMs: number;
    };
    messages: ChatMessage[];
    schema: z.ZodSchema<T>;
    schemaName: string;
    usageContext: Record<string, unknown>;
  }): Promise<{ data: T; usage: ProviderUsage; rawText: string }> {
    const effectiveTimeoutMs = Math.max(modelConfig.requestTimeoutMs, 120000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);
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
      debugLog("raw_http_response", responseText);
      const payload = parseCompletionPayload(responseText);
      const rawText = normalizeContent(payload.choices?.[0]?.message?.content);
      debugLog("raw_response", payload);
      debugLog("raw_content", rawText);
      const jsonText = extractJsonObject(rawText);
      debugLog("parsed_json_text", jsonText);
      const parsedJson = JSON.parse(jsonText);
      const data = schema.parse(parsedJson);
      debugLog("validated_data", data);
      return {
        data,
        rawText: jsonText,
        usage: buildUsage(modelConfig.model, payload)
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        debugLog("abort", {
          endpoint: `${modelConfig.baseUrl.replace(/\/$/, "")}/chat/completions`,
          model: modelConfig.model,
          schemaName,
          timeoutMs: effectiveTimeoutMs
        });
        throw new Error(
          `Provider request timed out after ${effectiveTimeoutMs}ms for model ${modelConfig.model}`
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
