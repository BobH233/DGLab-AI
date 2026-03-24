import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmCallListResponse } from "@dglab-ai/shared";
import LlmCallHistoryPage from "../LlmCallHistoryPage.vue";

const apiMocks = vi.hoisted(() => ({
  listLlmCalls: vi.fn<() => Promise<LlmCallListResponse>>()
}));

vi.mock("../../api", () => ({
  api: {
    listLlmCalls: apiMocks.listLlmCalls
  }
}));

describe("LlmCallHistoryPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders llm call rows in reverse-time list view", async () => {
    apiMocks.listLlmCalls.mockResolvedValue({
      items: [
        {
          id: "llm_call_1",
          provider: "openai-compatible",
          model: "gpt-4.1-mini",
          kind: "ensemble-turn",
          schemaName: "ensemble_action_batch",
          status: "success",
          startedAt: "2026-03-19T11:51:31.000Z",
          finishedAt: "2026-03-19T11:52:20.000Z",
          durationMs: 49000,
          promptTokens: 28442,
          completionTokens: 1417,
          totalTokens: 29859,
          sessionId: "session_1",
          context: {
            kind: "ensemble-turn",
            sessionId: "session_1",
            protocolFallback: true,
            missingProtocolBlocks: ["playerBodyItemState"]
          },
          errorMessage: null
        },
        {
          id: "llm_call_2",
          provider: "openai-compatible",
          model: "gpt-4.1-mini",
          kind: "memory-turn-summary",
          schemaName: "turn_memory_summary",
          status: "error",
          startedAt: "2026-03-19T11:49:50.000Z",
          finishedAt: "2026-03-19T11:50:11.000Z",
          durationMs: 21000,
          promptTokens: 1200,
          completionTokens: 0,
          totalTokens: 1200,
          sessionId: "session_1",
          context: {
            kind: "memory-turn-summary",
            sessionId: "session_1"
          },
          errorMessage: "Provider request timed out"
        }
      ],
      page: 1,
      pageSize: 25,
      total: 2,
      totalPages: 1
    });

    const wrapper = mount(LlmCallHistoryPage);
    await flushPromises();

    expect(apiMocks.listLlmCalls).toHaveBeenCalledWith(1, 25);
    expect(wrapper.text()).toContain("模型调用记录");
    expect(wrapper.text()).toContain("gpt-4.1-mini");
    expect(wrapper.text()).toContain("ensemble-turn");
    expect(wrapper.text()).toContain("memory-turn-summary");
    expect(wrapper.text()).toContain("协议降级成功");
    expect(wrapper.text()).toContain("缺失 playerBodyItemState");
    expect(wrapper.text()).toContain("Provider request timed out");
    expect(wrapper.text()).toContain("50%");
  });
});
