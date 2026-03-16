import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EventTimeline from "../EventTimeline.vue";

describe("EventTimeline", () => {
  it("renders event labels and content", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [
          {
            sessionId: "session_1",
            seq: 1,
            type: "player.message",
            source: "player",
            createdAt: new Date().toISOString(),
            payload: {
              text: "测试消息"
            }
          }
        ]
      }
    });

    expect(wrapper.text()).toContain("玩家输入");
    expect(wrapper.text()).toContain("你说");
    expect(wrapper.text()).toContain("测试消息");
  });

  it("renders live pause state instead of a persisted wait card", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [
          {
            sessionId: "session_1",
            seq: 2,
            type: "system.wait_scheduled",
            source: "system",
            agentId: "director",
            createdAt: new Date().toISOString(),
            payload: {
              speaker: "主导者",
              reason: "停顿一秒后再继续说话。",
              delayMs: 1000,
              mode: "in_turn_pause"
            }
          }
        ],
        activePause: {
          title: "主导者 正在注视你",
          main: "主导者 暂时没有继续开口，像是在观察你的反应……",
          meta: "节奏说明：停顿一秒后再继续说话。",
          countdownLabel: "约 1.0 秒后继续"
        }
      }
    });

    expect(wrapper.text()).toContain("节奏控制");
    expect(wrapper.text()).toContain("主导者 正在注视你");
    expect(wrapper.text()).toContain("像是在观察你的反应");
    expect(wrapper.text()).toContain("约 1.0 秒后继续");
    expect(wrapper.text()).not.toContain("主导者 短暂停顿");
  });
});
