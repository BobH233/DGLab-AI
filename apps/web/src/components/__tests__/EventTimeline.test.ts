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
});
