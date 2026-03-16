import { describe, expect, it, vi, afterEach } from "vitest";
import { defaultToolStates } from "@dglab-ai/shared";
import { z } from "zod";
import { OpenAICompatibleProvider } from "../infra/OpenAICompatibleProvider.js";

const modelConfig = {
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
                }
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
        })
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
      }
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
                }
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
        })
      }),
      schemaName: "action_batch",
      usageContext: {}
    })).rejects.toThrow();
  });
});
