import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EventTimeline from "../EventTimeline.vue";

describe("EventTimeline preview", () => {
  it("renders preview cards with normal labels, resolved actor names, and newest-first order", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [],
        agents: [
          {
            id: "director_1",
            name: "珊瑚宫心海",
            role: "director",
            summary: "主导者",
            persona: "冷静",
            goals: ["推进"],
            style: [],
            boundaries: [],
            sortOrder: 0
          }
        ],
        previewTurn: {
          turnId: "tick_1",
          status: "streaming",
          actions: [
            {
              index: 0,
              actorAgentId: "director_1",
              tool: "perform_stage_direction",
              targetScope: "scene",
              textByPath: {
                "args.direction": {
                  visibleSegments: [
                    {
                      type: "text",
                      text: "她先向前一步。"
                    }
                  ],
                  pendingBuffer: ""
                }
              },
              completedFields: [],
              completed: false
            },
            {
              index: 1,
              actorAgentId: "director_1",
              tool: "speak_to_player",
              targetScope: "player",
              textByPath: {
                "args.message": {
                  visibleSegments: [
                    {
                      type: "text",
                      text: "先抬头看我。"
                    },
                    {
                      type: "delay",
                      delayMs: 800
                    },
                    {
                      type: "text",
                      text: "别急着回答。"
                    }
                  ],
                  pendingBuffer: ""
                }
              },
              completedFields: [],
              completed: false
            }
          ]
        }
      }
    });

    const previewItems = wrapper.findAll('.timeline-item[data-preview="true"]');

    expect(previewItems).toHaveLength(2);
    expect(previewItems[0]?.text()).toContain("角色发言");
    expect(previewItems[0]?.text()).toContain("珊瑚宫心海");
    expect(previewItems[1]?.text()).toContain("舞台动作");
    expect(wrapper.text()).toContain("先抬头看我。");
    expect(wrapper.text()).toContain("停顿 800 ms");
    expect(wrapper.text()).toContain("生成中");
  });
});
