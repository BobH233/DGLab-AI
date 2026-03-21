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
  reasoningEffort: "medium" as const,
  maxTokens: 300,
  topP: 1,
  requestTimeoutMs: 1000,
  toolStates: defaultToolStates()
};

describe("OpenAICompatibleProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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

  it("falls back to chat completions and retries without reasoning_effort when streaming extras are unsupported", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          error: {
            message: "Unknown endpoint: /responses"
          }
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json"
          }
        }
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          error: {
            message: "Unknown parameter: reasoning_effort"
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
        [
          "data: {\"id\":\"chunk-1\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hello\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1,\"total_tokens\":3}}",
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
    const result = await provider.streamText({
      modelConfig,
      messages: [
        {
          role: "user",
          content: "Say hello"
        }
      ],
      usageContext: {}
    });

    expect(result.rawText).toBe("hello");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/responses");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      reasoning_effort: "medium"
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).not.toHaveProperty("reasoning_effort");
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

  it("streams text deltas to the caller while collecting the final response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      [
        "event: response.reasoning_summary_text.delta",
        "data: {\"type\":\"response.reasoning_summary_text.delta\",\"summary_index\":0,\"delta\":\"先试探她现在会不会躲。\"}",
        "",
        "event: response.output_text.delta",
        "data: {\"type\":\"response.output_text.delta\",\"delta\":\"@action {\\\"actorAgentId\\\":\\\"director\\\",\\\"tool\\\":\\\"speak_to_player\\\"}\\n@field args.message\\n你看着她\"}",
        "",
        "event: response.output_text.delta",
        "data: {\"type\":\"response.output_text.delta\",\"delta\":\"缓缓开口。\\n@endfield\\n@endaction\\n@turnControl {\\\"continue\\\":true,\\\"endStory\\\":false,\\\"needsHandoff\\\":false}\\n@playerBodyItemState []\\n@done\"}",
        "",
        "event: response.completed",
        "data: {\"type\":\"response.completed\",\"response\":{\"usage\":{\"input_tokens\":7,\"output_tokens\":15,\"total_tokens\":22}}}",
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

    const deltas: string[] = [];
    const reasoningDeltas: string[] = [];
    const provider = new OpenAICompatibleProvider();
    const result = await provider.streamText({
      modelConfig,
      messages: [
        {
          role: "system",
          content: "Return line protocol"
        }
      ],
      usageContext: {
        kind: "ensemble-turn"
      },
      onTextDelta: (delta) => {
        deltas.push(delta);
      },
      onReasoningSummaryDelta: (delta) => {
        reasoningDeltas.push(delta);
      }
    });

    expect(deltas).toHaveLength(2);
    expect(reasoningDeltas.join("")).toContain("先试探她现在会不会躲。");
    expect(result.rawText).toContain("@action");
    expect(result.rawText).toContain("@done");
    expect(result.reasoningSummary).toContain("先试探她现在会不会躲。");
    expect(result.usage.totalTokens).toBe(22);
  });

  it("prints streamed text deltas to stdout when LLM_DEBUG=1", async () => {
    vi.stubEnv("LLM_DEBUG", "1");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      [
        "event: response.output_text.delta",
        "data: {\"type\":\"response.output_text.delta\",\"delta\":\"@action {\\\"actorAgentId\\\":\\\"director\\\",\\\"tool\\\":\\\"speak_to_player\\\"}\\n\"}",
        "",
        "event: response.output_text.delta",
        "data: {\"type\":\"response.output_text.delta\",\"delta\":\"@done\"}",
        "",
        "event: response.completed",
        "data: {\"type\":\"response.completed\",\"response\":{\"usage\":{\"input_tokens\":7,\"output_tokens\":15,\"total_tokens\":22}}}",
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

    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const provider = new OpenAICompatibleProvider();

    await provider.streamText({
      modelConfig,
      messages: [
        {
          role: "system",
          content: "Return line protocol"
        }
      ],
      usageContext: {
        kind: "ensemble-turn",
        sessionId: "session_test"
      }
    });

    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining("[LLM STREAM START] stream_text"));
    expect(stdoutWrite).toHaveBeenCalledWith("@action {\"actorAgentId\":\"director\",\"tool\":\"speak_to_player\"}\n");
    expect(stdoutWrite).toHaveBeenCalledWith("@done");
    expect(stdoutWrite).toHaveBeenCalledWith("\n");
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining("[LLM STREAM END] completed stream_text"));
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
