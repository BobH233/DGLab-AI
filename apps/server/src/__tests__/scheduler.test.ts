import { describe, expect, it, vi } from "vitest";
import { SchedulerService } from "../services/SchedulerService.js";

describe("SchedulerService", () => {
  it("merges queued reasons into a single processor call", async () => {
    const processor = {
      processTick: vi.fn(async () => undefined)
    };
    const scheduler = new SchedulerService(async () => [], processor);

    scheduler.requestTick("session_1", "player_message");
    scheduler.requestTick("session_1", "timer_interval");

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(processor.processTick).toHaveBeenCalledTimes(1);
    expect(processor.processTick).toHaveBeenCalledWith(
      "session_1",
      expect.stringContaining("player_message")
    );
    expect(processor.processTick).toHaveBeenCalledWith(
      "session_1",
      expect.stringContaining("timer_interval")
    );
  });
});

