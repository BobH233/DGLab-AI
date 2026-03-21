import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyElectroStimToolEvent,
  createDefaultElectroStimLocalConfig,
  createPresetElectroStimIntensityCurve,
  mapIntensityPercentThroughCurve,
  normalizeElectroStimIntensityCurve
} from "../eStim";

describe("eStim intensity curve mapping", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("normalizes legacy or partial curve config back to a safe monotonic shape", () => {
    const normalized = normalizeElectroStimIntensityCurve({
      preset: "custom",
      points: [
        { inputPercent: 0, outputPercent: 12 },
        { inputPercent: 25, outputPercent: 40 },
        { inputPercent: 50, outputPercent: 30 },
        { inputPercent: 100, outputPercent: 82 }
      ]
    });

    expect(normalized.points).toEqual([
      { inputPercent: 0, outputPercent: 0 },
      { inputPercent: 25, outputPercent: 40 },
      { inputPercent: 50, outputPercent: 40 },
      { inputPercent: 75, outputPercent: 75 },
      { inputPercent: 100, outputPercent: 82 }
    ]);
  });

  it("maps requested intensity through the configured curve", () => {
    const curve = createPresetElectroStimIntensityCurve("easeIn");

    expect(mapIntensityPercentThroughCurve(curve, 0)).toBe(0);
    expect(mapIntensityPercentThroughCurve(curve, 25)).toBe(10);
    expect(mapIntensityPercentThroughCurve(curve, 50)).toBe(30);
    expect(mapIntensityPercentThroughCurve(curve, 60)).toBe(42);
    expect(mapIntensityPercentThroughCurve(curve, 100)).toBe(100);
  });

  it("uses the mapped intensity when sending a steady strength update", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          clientStrength: {
            a: {
              strength: 0,
              limit: 100
            }
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          clientStrength: {
            a: {
              strength: 30,
              limit: 100
            }
          }
        })
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const config = {
      ...createDefaultElectroStimLocalConfig(),
      gameConnectionCode: "client-1@http://localhost:8920",
      intensityCurve: {
        preset: "custom" as const,
        points: [
          { inputPercent: 0, outputPercent: 0 },
          { inputPercent: 25, outputPercent: 10 },
          { inputPercent: 50, outputPercent: 30 },
          { inputPercent: 75, outputPercent: 60 },
          { inputPercent: 100, outputPercent: 80 }
        ]
      }
    };

    const result = await applyElectroStimToolEvent(config, {
      command: "set",
      channels: {
        a: {
          intensityPercent: 50
        }
      }
    });

    expect(result.status).toBe("success");
    expect(result.detail).toContain("A 50% -> 30%");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8920/api/v2/game/client-1/strength",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          channels: {
            a: {
              strength: { set: 30 },
              randomStrength: { set: 0 }
            }
          }
        })
      })
    );
  });

  it("uses the mapped intensity when sending a fire command", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          clientStrength: {
            a: {
              strength: 0,
              limit: 80
            }
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          clientStrength: {
            a: {
              strength: 34,
              limit: 80
            }
          }
        })
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const config = {
      ...createDefaultElectroStimLocalConfig(),
      gameConnectionCode: "client-1@http://localhost:8920",
      intensityCurve: createPresetElectroStimIntensityCurve("easeOut")
    };

    const result = await applyElectroStimToolEvent(config, {
      command: "fire",
      durationMs: 1500,
      channels: {
        a: {
          intensityPercent: 25,
          enabled: true
        }
      }
    });

    expect(result.status).toBe("success");
    expect(result.detail).toContain("A 25% -> 40%");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8920/api/v2/game/client-1/action/fire",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          time: 1500,
          override: true,
          channels: {
            a: {
              enabled: true,
              strength: 32
            }
          }
        })
      })
    );
  });
});
