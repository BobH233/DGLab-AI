import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EventTimeline from "../EventTimeline.vue";

describe("EventTimeline preview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
          model: "gpt-5.4",
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
              valueByPath: {},
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
                      text: "先抬头看我。别急着回答。"
                    }
                  ],
                  pendingBuffer: ""
                }
              },
              valueByPath: {},
              completedFields: [],
              completed: false
            }
          ]
        }
      }
    });

    const previewItems = wrapper.findAll('.timeline-item[data-preview="true"]');
    const previewStatus = wrapper.find('.timeline-item[data-preview-status="true"] .timeline-compact');
    const dialogueCard = wrapper.find('.timeline-item[data-preview="true"][data-kind="dialogue"] .event-card');
    const actionCard = wrapper.find('.timeline-item[data-preview="true"][data-kind="action"] .event-card');

    expect(previewItems).toHaveLength(2);
    expect(previewStatus.exists()).toBe(true);
    expect(previewStatus.text()).toContain("模型");
    expect(previewStatus.text()).toContain("正在思考中");
    expect(previewStatus.text()).toContain("gpt-5.4");
    expect(previewItems[0]?.text()).toContain("角色发言");
    expect(previewItems[0]?.text()).toContain("珊瑚宫心海");
    expect(previewItems[1]?.text()).toContain("舞台动作");
    expect(dialogueCard.classes()).toContain("event-card--dialogue");
    expect(actionCard.classes()).not.toContain("event-card--dialogue");
    expect(previewItems[0]?.text()).toContain("对你说");
    expect(previewItems[0]?.text()).not.toContain("预览");
    expect(previewItems[0]?.text()).not.toContain("speak_to_player");
    expect(wrapper.text()).toContain("先抬头看我。别急着回答。");
  });

  it("renders completed preview status as a compact usage note", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [],
        previewTurn: {
          turnId: "tick_2",
          status: "completed",
          model: "gpt-5.4",
          totalTokens: 15253,
          actions: []
        }
      }
    });

    const previewStatus = wrapper.find('.timeline-item[data-preview-status="true"] .timeline-compact');

    expect(previewStatus.exists()).toBe(true);
    expect(previewStatus.text()).toContain("用量");
    expect(previewStatus.text()).toContain("15253 tokens");
    expect(previewStatus.text()).toContain("gpt-5.4");
  });

  it("renders update_scene_state as a streaming scene-state card", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [],
        previewTurn: {
          turnId: "tick_3",
          status: "streaming",
          model: "gpt-5.4",
          actions: [
            {
              index: 0,
              actorAgentId: "director_1",
              tool: "update_scene_state",
              targetScope: "scene",
              textByPath: {
                "args.phase": {
                  visibleSegments: [
                    {
                      type: "text",
                      text: "teasing"
                    }
                  ],
                  pendingBuffer: ""
                },
                "args.location": {
                  visibleSegments: [
                    {
                      type: "text",
                      text: "会客室"
                    }
                  ],
                  pendingBuffer: ""
                },
                "args.summary": {
                  visibleSegments: [
                    {
                      type: "text",
                      text: "你已经被她缓慢拉近的语气牵住了注意力。"
                    }
                  ],
                  pendingBuffer: ""
                }
              },
              valueByPath: {
                "args.tension": 7,
                "args.activeObjectives": ["让你继续停留", "逼你给出更诚实的回应"]
              },
              completedFields: ["args.phase", "args.location", "args.summary", "args.tension", "args.activeObjectives"],
              completed: false
            }
          ]
        }
      }
    });

    const previewItem = wrapper.find('.timeline-item[data-preview="true"][data-kind="system"] .event-card');

    expect(previewItem.exists()).toBe(true);
    expect(previewItem.text()).toContain("场景状态");
    expect(previewItem.text()).toContain("场景已更新");
    expect(previewItem.text()).toContain("阶段");
    expect(previewItem.text()).toContain("teasing");
    expect(previewItem.text()).toContain("地点");
    expect(previewItem.text()).toContain("会客室");
    expect(previewItem.text()).toContain("张力");
    expect(previewItem.text()).toContain("7");
    expect(previewItem.text()).toContain("概要");
    expect(previewItem.text()).toContain("你已经被她缓慢拉近的语气牵住了注意力。");
    expect(previewItem.text()).toContain("目标");
    expect(previewItem.text()).toContain("让你继续停留");
  });

  it("holds back post-delay preview text until the inline delay finishes", async () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [],
        previewTurn: {
          turnId: "tick_4",
          status: "streaming",
          model: "gpt-5.4",
          actions: [
            {
              index: 0,
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
              valueByPath: {},
              completedFields: [],
              completed: false
            }
          ]
        }
      }
    });

    expect(wrapper.text()).toContain("先抬头看我。");
    expect(wrapper.text()).toContain("约 800 ms 后继续");
    expect(wrapper.text()).not.toContain("别急着回答。");

    await vi.advanceTimersByTimeAsync(801);

    expect(wrapper.text()).toContain("别急着回答。");
  });

  it("does not split one streaming sentence into one bubble per delta chunk", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [],
        previewTurn: {
          turnId: "tick_5",
          status: "streaming",
          model: "gpt-5.4",
          actions: [
            {
              index: 0,
              actorAgentId: "director_1",
              tool: "speak_to_player",
              targetScope: "player",
              textByPath: {
                "args.message": {
                  visibleSegments: [
                    { type: "text", text: "先" },
                    { type: "text", text: "抬" },
                    { type: "text", text: "头" },
                    { type: "text", text: "看" },
                    { type: "text", text: "我" }
                  ],
                  pendingBuffer: ""
                }
              },
              valueByPath: {},
              completedFields: [],
              completed: false
            }
          ]
        }
      }
    });

    const previewItems = wrapper.findAll('.timeline-item[data-preview="true"][data-kind="dialogue"] .event-card');

    expect(previewItems).toHaveLength(1);
    expect(previewItems[0]?.text()).toContain("先抬头看我");
  });

  it("updates apply_story_effect preview title and intensity once those fields complete", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [],
        previewTurn: {
          turnId: "tick_6",
          status: "streaming",
          model: "gpt-5.4",
          actions: [
            {
              index: 0,
              actorAgentId: "support_1",
              tool: "apply_story_effect",
              targetScope: "scene",
              textByPath: {
                "args.description": {
                  visibleSegments: [
                    {
                      type: "text",
                      text: "你感觉空气里的温度被悄悄抬高了一点。"
                    }
                  ],
                  pendingBuffer: ""
                }
              },
              valueByPath: {
                "args.label": "暧昧升温",
                "args.intensity": 6
              },
              completedFields: ["args.label", "args.intensity"],
              completed: false
            }
          ]
        }
      }
    });

    const previewItem = wrapper.find('.timeline-item[data-preview="true"][data-kind="effect"] .event-card');

    expect(previewItem.exists()).toBe(true);
    expect(previewItem.text()).toContain("剧情变化");
    expect(previewItem.text()).toContain("暧昧升温");
    expect(previewItem.text()).toContain("强度：6");
    expect(previewItem.text()).toContain("你感觉空气里的温度被悄悄抬高了一点。");
  });

  it("does not replay old inline delays when restoring preview from a snapshot", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [],
        previewTurn: {
          turnId: "tick_7",
          status: "streaming",
          model: "gpt-5.4",
          restoredActionIndexes: [0],
          actions: [
            {
              index: 0,
              actorAgentId: "director_1",
              tool: "speak_to_player",
              targetScope: "player",
              textByPath: {
                "args.message": {
                  visibleSegments: [
                    {
                      type: "text",
                      text: "第一段。"
                    },
                    {
                      type: "delay",
                      delayMs: 800
                    },
                    {
                      type: "text",
                      text: "第二段。"
                    }
                  ],
                  pendingBuffer: ""
                }
              },
              valueByPath: {},
              completedFields: [],
              completed: false
            }
          ]
        }
      }
    });

    expect(wrapper.text()).toContain("第一段。");
    expect(wrapper.text()).toContain("第二段。");
    expect(wrapper.text()).toContain("约 800 ms 后继续");
    expect(wrapper.find('.timeline-item[data-preview="true"][data-kind="pause"][data-live="true"]').exists()).toBe(false);
  });
});
