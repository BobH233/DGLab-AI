import { describe, expect, it, vi, afterEach } from "vitest";
import { defaultToolStates } from "@dglab-ai/shared";
import { z } from "zod";
import { OpenAICompatibleProvider } from "../infra/OpenAICompatibleProvider.js";

const modelConfig = {
  provider: "openai-compatible" as const,
  baseUrl: "https://example.com/v1",
  apiKey: "secret",
  model: "test-model",
  temperature: 0.8,
  maxTokens: 300,
  topP: 1,
  requestTimeoutMs: 1000,
  toolStates: defaultToolStates()
};

describe("OpenAICompatibleProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to plain JSON prompting when json_schema response_format is unsupported", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          error: {
            message: "This response_format type is unavailable now"
          }
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "{\"ok\":true}"
              }
            }
          ],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 7,
            total_tokens: 18
          }
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      ));

    const provider = new OpenAICompatibleProvider();
    const result = await provider.completeJson({
      modelConfig,
      messages: [
        {
          role: "system",
          content: "Return JSON"
        }
      ],
      schema: z.object({
        ok: z.boolean()
      }),
      schemaName: "test_schema",
      usageContext: {}
    });

    expect(result.data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("accepts action batches that use exact tool and args keys", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actions: [
                  {
                    tool: "perform_stage_direction",
                    args: {
                      direction: "门开了。"
                    }
                  }
                ],
                turnControl: {
                  continue: true
                },
                playerBodyItemState: []
              })
            }
          }
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 9,
          total_tokens: 14
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    ));

    const provider = new OpenAICompatibleProvider();
    const result = await provider.completeJson({
      modelConfig,
      messages: [
        {
          role: "system",
          content: "Return JSON"
        }
      ],
      schema: z.object({
        actions: z.array(z.object({
          tool: z.string(),
          args: z.record(z.unknown())
        })),
        turnControl: z.object({
          continue: z.boolean()
        }),
        playerBodyItemState: z.array(z.string())
      }),
      schemaName: "action_batch",
      usageContext: {}
    });

    expect(result.data).toEqual({
      actions: [
        {
          tool: "perform_stage_direction",
          args: {
            direction: "门开了。"
          }
        }
      ],
        turnControl: {
          continue: true
        },
        playerBodyItemState: []
      });
  });

  it("parses SSE data chunk responses and reconstructs content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      [
        "data: {\"id\":\"chunk-1\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"{\\\"ok\\\":\"},\"finish_reason\":null}]}",
        "",
        "data: {\"id\":\"chunk-1\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"true}\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2,\"total_tokens\":5}}",
        "",
        "data: [DONE]"
      ].join("\n"),
      {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream"
        }
      }
    ));

    const provider = new OpenAICompatibleProvider();
    const result = await provider.completeJson({
      modelConfig,
      messages: [
        {
          role: "system",
          content: "Return JSON"
        }
      ],
      schema: z.object({
        ok: z.boolean()
      }),
      schemaName: "test_schema",
      usageContext: {}
    });

    expect(result.data).toEqual({ ok: true });
    expect(result.rawText).toBe("{\"ok\":true}");
    expect(result.usage.totalTokens).toBe(5);
  });

  it("extracts the first complete JSON object after think blocks", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: [
                "<think>",
                "code_execution {\"code\":\"print(\\\"debug\\\")\"}",
                "</think>",
                "{",
                "\"actions\":[],",
                "\"turnControl\":{\"continue\":true},",
                "\"playerBodyItemState\":[]",
                "}"
              ].join("\n")
            }
          }
        ],
        usage: {
          prompt_tokens: 4,
          completion_tokens: 6,
          total_tokens: 10
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    ));

    const provider = new OpenAICompatibleProvider();
    const result = await provider.completeJson({
      modelConfig,
      messages: [
        {
          role: "system",
          content: "Return JSON"
        }
      ],
      schema: z.object({
        actions: z.array(z.unknown()),
        turnControl: z.object({
          continue: z.boolean()
        }),
        playerBodyItemState: z.array(z.string())
      }),
      schemaName: "action_batch",
      usageContext: {}
    });

    expect(result.data).toEqual({
      actions: [],
        turnControl: {
          continue: true
        },
        playerBodyItemState: []
      });
  });

  it("rejects action batches that use legacy tool key aliases", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actions: [
                  {
                    action: "speak_to_player",
                    args: {
                      message: "回答我。"
                    }
                  }
                ],
                turnControl: {
                  continue: true
                },
                playerBodyItemState: []
              })
            }
          }
        ],
        usage: {
          prompt_tokens: 6,
          completion_tokens: 10,
          total_tokens: 16
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    ));

    const provider = new OpenAICompatibleProvider();
    await expect(provider.completeJson({
      modelConfig,
      messages: [
        {
          role: "system",
          content: "Return JSON"
        }
      ],
      schema: z.object({
        actions: z.array(z.object({
          tool: z.string(),
          args: z.record(z.unknown())
        })),
        turnControl: z.object({
          continue: z.boolean()
        }),
        playerBodyItemState: z.array(z.string())
      }),
      schemaName: "action_batch",
      usageContext: {}
    })).rejects.toThrow();
  });

  it("records successful llm call telemetry", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "{\"ok\":true}"
            }
          }
        ],
        usage: {
          prompt_tokens: 8,
          completion_tokens: 4,
          total_tokens: 12
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    ));
    const recordLlmCall = vi.fn();
    const provider = new OpenAICompatibleProvider({ recordLlmCall });

    await provider.completeJson({
      modelConfig,
      messages: [
        {
          role: "system",
          content: "Return JSON"
        }
      ],
      schema: z.object({
        ok: z.boolean()
      }),
      schemaName: "test_schema",
      usageContext: {
        kind: "world-builder",
        sessionId: "session_1"
      }
    });

    expect(recordLlmCall).toHaveBeenCalledWith(expect.objectContaining({
      provider: "openai-compatible",
      model: "test-model",
      kind: "world-builder",
      schemaName: "test_schema",
      status: "success",
      promptTokens: 8,
      completionTokens: 4,
      totalTokens: 12,
      sessionId: "session_1",
      errorMessage: null
    }));
  });

  it("records failed llm call telemetry", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "{\"legacy\":true}"
            }
          }
        ],
        usage: {
          prompt_tokens: 3,
          completion_tokens: 2,
          total_tokens: 5
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    ));
    const recordLlmCall = vi.fn();
    const provider = new OpenAICompatibleProvider({ recordLlmCall });

    await expect(provider.completeJson({
      modelConfig,
      messages: [
        {
          role: "system",
          content: "Return JSON"
        }
      ],
      schema: z.object({
        ok: z.boolean()
      }),
      schemaName: "test_schema",
      usageContext: {
        kind: "ensemble-turn"
      }
    })).rejects.toThrow();

    expect(recordLlmCall).toHaveBeenCalledWith(expect.objectContaining({
      kind: "ensemble-turn",
      status: "error",
      promptTokens: 3,
      completionTokens: 2,
      totalTokens: 5
    }));
    expect(recordLlmCall.mock.calls[0]?.[0]?.errorMessage).toContain("Required");
  });
});
