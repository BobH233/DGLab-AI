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

    const playerCard = wrapper.find('.timeline-item[data-kind="player"] .event-card');

    expect(playerCard.exists()).toBe(true);
    expect(playerCard.classes()).toContain("event-card--player");
    expect(wrapper.text()).toContain("玩家输入");
    expect(wrapper.text()).toContain("你说");
    expect(wrapper.text()).toContain("测试消息");
  });

  it("renders live pause state as a compact timeline note", () => {
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
              mode: "in_turn_pause",
              title: "主导者 正在注视你",
              uiPauseId: "pause-1"
            }
          }
        ],
        activePause: {
          id: "pause-1",
          countdownLabel: "约 1.0 秒后继续"
        }
      }
    });

    const pauseItem = wrapper.find('.timeline-item[data-kind="pause"][data-compact="true"] .timeline-compact');

    expect(pauseItem.exists()).toBe(true);
    expect(wrapper.text()).toContain("节奏控制");
    expect(wrapper.text()).toContain("主导者 正在注视你");
    expect(wrapper.text()).toContain("原因：停顿一秒后再继续说话。");
    expect(wrapper.text()).toContain("约 1.0 秒后继续");
    expect(wrapper.find('.timeline-item[data-kind="pause"] .event-card').exists()).toBe(false);
  });

  it("renders automation countdown inside the timeline", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [],
        automationStatus: {
          title: "约 8.0 秒后自动推进",
          meta: "自动推进",
          live: true
        }
      }
    });

    const automationItem = wrapper.find('.timeline-item[data-automation="true"] .timeline-compact');

    expect(automationItem.exists()).toBe(true);
    expect(wrapper.text()).toContain("自动推进");
    expect(wrapper.text()).toContain("约 8.0 秒后自动推进");
    expect(wrapper.find('.timeline-item[data-automation="true"] .timeline-compact__dots').exists()).toBe(true);
  });

  it("renders character dialogue with a dedicated bubble style", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [
          {
            sessionId: "session_1",
            seq: 2,
            type: "agent.speak_player",
            source: "agent",
            agentId: "director",
            createdAt: new Date().toISOString(),
            payload: {
              speaker: "钟离",
              message: "把目光留在我这里。"
            }
          }
        ]
      }
    });

    const dialogueCard = wrapper.find('.timeline-item[data-kind="dialogue"] .event-card');
    expect(dialogueCard.exists()).toBe(true);
    expect(dialogueCard.classes()).toContain("event-card--dialogue");
    expect(wrapper.text()).toContain("钟离");
    expect(wrapper.text()).toContain("把目光留在我这里");
  });

  it("strips inline delay tags from rendered text", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [
          {
            sessionId: "session_1",
            seq: 2,
            type: "agent.speak_player",
            source: "agent",
            agentId: "director",
            createdAt: new Date().toISOString(),
            payload: {
              speaker: "钟离",
              message: "先别躲。<delay>1000</delay>看着我。"
            }
          }
        ]
      }
    });

    expect(wrapper.text()).toContain("先别躲。看着我。");
    expect(wrapper.text()).not.toContain("<delay>");
  });

  it("renders simulated device control events in the timeline", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [
          {
            sessionId: "session_1",
            seq: 4,
            type: "agent.device_control",
            source: "agent",
            agentId: "director",
            createdAt: new Date().toISOString(),
            payload: {
              speaker: "钟离",
              action: "control_vibe_toy",
              deviceId: "vibe_toy",
              deviceName: "穿戴式震动小玩具",
              intensityPercent: 80,
              mode: "pulse",
              supportedModes: ["steady", "pulse", "wave", "tease"],
              status: "simulated"
            }
          }
        ]
      }
    });

    const optionalToolItem = wrapper.find('.timeline-item[data-optional-tool="true"]');
    const optionalToolCard = wrapper.find('.timeline-item[data-optional-tool="true"] .event-card');

    expect(optionalToolItem.exists()).toBe(true);
    expect(optionalToolCard.classes()).toContain("event-card--optional-tool");
    expect(wrapper.text()).toContain("设备控制");
    expect(wrapper.text()).toContain("可选工具");
    expect(wrapper.text()).toContain("钟离 调用了 穿戴式震动小玩具");
    expect(wrapper.text()).toContain("强度调整为 80%");
    expect(wrapper.text()).toContain("模式切换为 pulse");
    expect(wrapper.text()).toContain("执行状态：simulated");
  });

  it("renders tick failure events with retryable context", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [
          {
            sessionId: "session_1",
            seq: 3,
            type: "system.tick_failed",
            source: "system",
            createdAt: new Date().toISOString(),
            payload: {
              reason: "player_message",
              message: "Provider returned non-JSON content",
              retryable: true
            }
          }
        ]
      }
    });

    expect(wrapper.text()).toContain("系统异常");
    expect(wrapper.text()).toContain("本轮推进失败");
    expect(wrapper.text()).toContain("Provider returned non-JSON content");
    expect(wrapper.text()).toContain("可重试");
  });

  it("shows the newest events at the top of the timeline", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [
          {
            sessionId: "session_1",
            seq: 1,
            type: "player.message",
            source: "player",
            createdAt: new Date("2026-03-16T10:00:00.000Z").toISOString(),
            payload: {
              text: "第一条消息"
            }
          },
          {
            sessionId: "session_1",
            seq: 2,
            type: "player.message",
            source: "player",
            createdAt: new Date("2026-03-16T10:01:00.000Z").toISOString(),
            payload: {
              text: "最新消息"
            }
          }
        ]
      }
    });

    const cards = wrapper.findAll('.timeline-item[data-kind="player"] .event-main');

    expect(cards).toHaveLength(2);
    expect(cards[0]?.text()).toContain("最新消息");
    expect(cards[1]?.text()).toContain("第一条消息");
  });

  it("keeps a wait note inside the timeline so later fragments appear above it", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [
          {
            sessionId: "session_1",
            seq: 11,
            type: "agent.speak_player",
            source: "agent",
            agentId: "director",
            createdAt: new Date("2026-03-16T10:00:00.000Z").toISOString(),
            payload: {
              speaker: "八重神子",
              message: "第一段。"
            }
          },
          {
            sessionId: "session_1",
            seq: 11,
            type: "system.wait_scheduled",
            source: "system",
            agentId: "director",
            createdAt: new Date("2026-03-16T10:00:01.000Z").toISOString(),
            payload: {
              title: "动作停在半空",
              meta: "舞台节奏停顿",
              delayMs: 800,
              mode: "inline_pause",
              uiPauseId: "pause-inline-1"
            }
          },
          {
            sessionId: "session_1",
            seq: 11,
            type: "agent.speak_player",
            source: "agent",
            agentId: "director",
            createdAt: new Date("2026-03-16T10:00:02.000Z").toISOString(),
            payload: {
              speaker: "八重神子",
              message: "第二段。"
            }
          }
        ]
      }
    });

    const items = wrapper.findAll(".timeline-item");

    expect(items).toHaveLength(3);
    expect(items[0]?.text()).toContain("第二段。");
    expect(items[1]?.attributes("data-kind")).toBe("pause");
    expect(items[1]?.text()).toContain("动作停在半空");
    expect(items[2]?.text()).toContain("第一段。");
  });

  it("renders tick and usage events as compact timeline notes", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [
          {
            sessionId: "session_1",
            seq: 8,
            type: "system.tick_started",
            source: "system",
            createdAt: new Date().toISOString(),
            payload: {
              reason: "player_message"
            }
          },
          {
            sessionId: "session_1",
            seq: 9,
            type: "system.usage_recorded",
            source: "system",
            createdAt: new Date().toISOString(),
            payload: {
              totalTokens: 10905,
              model: "gpt-4.1-mini"
            }
          }
        ]
      }
    });

    const compactItems = wrapper.findAll('.timeline-item[data-compact="true"] .timeline-compact');

    expect(compactItems).toHaveLength(2);
    expect(wrapper.text()).toContain("推演开始");
    expect(wrapper.text()).toContain("原因：player_message");
    expect(wrapper.text()).toContain("10905 tokens");
    expect(wrapper.text()).not.toContain("本次模型调用消耗已计入会话统计");
    expect(wrapper.find('.timeline-item[data-compact="true"] .event-card').exists()).toBe(false);
  });

  it("renders scene updates as separate detail rows instead of one sentence", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [
          {
            sessionId: "session_1",
            seq: 10,
            type: "scene.updated",
            source: "system",
            createdAt: new Date().toISOString(),
            payload: {
              phase: "teasing",
              location: "会客室",
              tension: 7,
              summary: "你已经被他若即若离的试探牵住心神。",
              activeObjectives: ["让你继续留在这场对话里", "引出你更坦率的回应"]
            }
          }
        ]
      }
    });

    const detailRows = wrapper.findAll('.timeline-item[data-kind="system"] .event-detail-row');

    expect(detailRows).toHaveLength(6);
    expect(wrapper.text()).toContain("阶段");
    expect(wrapper.text()).toContain("teasing");
    expect(wrapper.text()).toContain("地点");
    expect(wrapper.text()).toContain("会客室");
    expect(wrapper.text()).toContain("张力");
    expect(wrapper.text()).toContain("7");
    expect(wrapper.text()).toContain("概要");
    expect(wrapper.text()).toContain("你已经被他若即若离的试探牵住心神");
    expect(wrapper.text()).toContain("目标");
    expect(wrapper.text()).not.toContain("阶段变更为");
  });

  it("renders player body item state updates as a diff-style block", () => {
    const wrapper = mount(EventTimeline, {
      props: {
        events: [
          {
            sessionId: "session_1",
            seq: 12,
            type: "player.body_item_state_updated",
            source: "system",
            createdAt: new Date().toISOString(),
            payload: {
              previousPlayerBodyItemState: ["你现在戴着一副遮光眼罩"],
              playerBodyItemState: [
                "你现在戴着一副遮光眼罩",
                "你现在双手被红色绳子捆在身后"
              ]
            }
          }
        ]
      }
    });

    expect(wrapper.text()).toContain("玩家身体道具状态已更新");
    expect(wrapper.text()).toContain("当前");
    expect(wrapper.text()).toContain("你现在双手被红色绳子捆在身后");
    expect(wrapper.find('.event-diff .event-diff__line[data-prefix="+"]').exists()).toBe(true);
    expect(wrapper.find('.event-card--inventory').exists()).toBe(true);
  });
});
