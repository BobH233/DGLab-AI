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
});
