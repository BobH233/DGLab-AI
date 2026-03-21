import type { EStimPulse, ToolContext } from "@dglab-ai/shared";

const LOCAL_STORAGE_KEY = "dglabai.e_stim_config";
export const ELECTRO_STIM_INTENSITY_CURVE_ANCHORS = [0, 25, 50, 75, 100] as const;

const INTENSITY_CURVE_PRESET_OUTPUTS = {
  linear: [0, 25, 50, 75, 100],
  easeOut: [0, 40, 65, 85, 100],
  easeIn: [0, 10, 30, 60, 100],
  sCurve: [0, 12, 50, 88, 100]
} as const;

type ChannelKey = "a" | "b";
export type ElectroStimIntensityCurvePreset = keyof typeof INTENSITY_CURVE_PRESET_OUTPUTS | "custom";
export type ElectroStimIntensityCurvePoint = {
  inputPercent: number;
  outputPercent: number;
};
export type ElectroStimIntensityCurveConfig = {
  preset: ElectroStimIntensityCurvePreset;
  points: ElectroStimIntensityCurvePoint[];
};

type GameInfoResponse = {
  status: number;
  code: string;
  strengthConfig?: Record<string, { strength?: number; randomStrength?: number }>;
  gameConfig?: {
    channels?: Record<string, {
      enabled?: boolean;
      fireStrengthLimit?: number;
      pulseId?: string | string[];
      firePulseId?: string;
    }>;
  };
  clientStrength?: Record<string, {
    strength?: number;
    limit?: number;
    tempStrength?: number;
  }>;
  currentPulseId?: Record<string, string | undefined>;
};

type PulseListResponse = {
  status: number;
  code: string;
  pulseList?: EStimPulse[];
};

export type ElectroStimLocalConfig = {
  gameConnectionCode: string;
  bChannelEnabled: boolean;
  channelPlacements: {
    a: string;
    b: string;
  };
  intensityCurve: ElectroStimIntensityCurveConfig;
  availablePulses: EStimPulse[];
  allowedPulseIds: string[];
  lastValidatedAt?: string;
};

export type ElectroStimExecutionResult = {
  status: "success" | "simulated" | "error";
  detail: string;
  toolContext?: ToolContext;
};

export function createDefaultElectroStimLocalConfig(): ElectroStimLocalConfig {
  return {
    gameConnectionCode: "",
    bChannelEnabled: false,
    channelPlacements: {
      a: "",
      b: ""
    },
    intensityCurve: createPresetElectroStimIntensityCurve("linear"),
    availablePulses: [],
    allowedPulseIds: []
  };
}

function isCurvePreset(value: unknown): value is ElectroStimIntensityCurvePreset {
  return value === "custom" || value === "linear" || value === "easeOut" || value === "easeIn" || value === "sCurve";
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function cloneIntensityCurvePoints(points: ElectroStimIntensityCurvePoint[]): ElectroStimIntensityCurvePoint[] {
  return points.map((point) => ({
    inputPercent: point.inputPercent,
    outputPercent: point.outputPercent
  }));
}

function normalizeIntensityCurvePoints(
  points: unknown,
  fallbackPoints: ElectroStimIntensityCurvePoint[]
): ElectroStimIntensityCurvePoint[] {
  const rawPoints = Array.isArray(points) ? points : [];
  const rawOutputByInput = new Map<number, number>();
  for (const rawPoint of rawPoints) {
    if (
      typeof rawPoint === "object"
      && rawPoint
      && typeof rawPoint.inputPercent === "number"
      && typeof rawPoint.outputPercent === "number"
    ) {
      rawOutputByInput.set(clampPercent(rawPoint.inputPercent), clampPercent(rawPoint.outputPercent));
    }
  }

  const normalized = fallbackPoints.map((fallbackPoint) => ({
    inputPercent: fallbackPoint.inputPercent,
    outputPercent: rawOutputByInput.get(fallbackPoint.inputPercent) ?? fallbackPoint.outputPercent
  }));
  normalized[0] = {
    inputPercent: normalized[0].inputPercent,
    outputPercent: 0
  };
  for (let index = 1; index < normalized.length; index += 1) {
    normalized[index] = {
      inputPercent: normalized[index].inputPercent,
      outputPercent: Math.max(normalized[index - 1].outputPercent, clampPercent(normalized[index].outputPercent))
    };
  }
  return normalized;
}

export function createPresetElectroStimIntensityCurve(
  preset: Exclude<ElectroStimIntensityCurvePreset, "custom">
): ElectroStimIntensityCurveConfig {
  return {
    preset,
    points: ELECTRO_STIM_INTENSITY_CURVE_ANCHORS.map((inputPercent, index) => ({
      inputPercent,
      outputPercent: INTENSITY_CURVE_PRESET_OUTPUTS[preset][index]
    }))
  };
}

export function normalizeElectroStimIntensityCurve(
  curve: Partial<ElectroStimIntensityCurveConfig> | undefined
): ElectroStimIntensityCurveConfig {
  const preset = isCurvePreset(curve?.preset) ? curve.preset : "linear";
  const fallbackPreset = preset === "custom" ? "linear" : preset;
  const fallbackCurve = createPresetElectroStimIntensityCurve(fallbackPreset);
  return {
    preset,
    points: normalizeIntensityCurvePoints(curve?.points, fallbackCurve.points)
  };
}

function cloneElectroStimLocalConfig(config: ElectroStimLocalConfig): ElectroStimLocalConfig {
  return {
    ...config,
    channelPlacements: {
      ...config.channelPlacements
    },
    intensityCurve: {
      preset: config.intensityCurve.preset,
      points: cloneIntensityCurvePoints(config.intensityCurve.points)
    },
    availablePulses: [...config.availablePulses],
    allowedPulseIds: [...config.allowedPulseIds]
  };
}

function getElectroStimStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  if (typeof window === "undefined") {
    return null;
  }
  const storage = window.localStorage as Partial<Storage> | undefined;
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    return null;
  }
  return {
    getItem: storage.getItem.bind(storage),
    setItem: storage.setItem.bind(storage)
  };
}

export function loadElectroStimLocalConfig(): ElectroStimLocalConfig {
  const storage = getElectroStimStorage();
  if (!storage) {
    return createDefaultElectroStimLocalConfig();
  }
  const raw = storage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) {
    return createDefaultElectroStimLocalConfig();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ElectroStimLocalConfig>;
    return {
      ...createDefaultElectroStimLocalConfig(),
      ...parsed,
      channelPlacements: {
        ...createDefaultElectroStimLocalConfig().channelPlacements,
        ...(parsed.channelPlacements ?? {})
      },
      intensityCurve: normalizeElectroStimIntensityCurve(parsed.intensityCurve),
      availablePulses: Array.isArray(parsed.availablePulses) ? parsed.availablePulses : [],
      allowedPulseIds: Array.isArray(parsed.allowedPulseIds) ? parsed.allowedPulseIds : []
    };
  } catch {
    return createDefaultElectroStimLocalConfig();
  }
}

export function saveElectroStimLocalConfig(config: ElectroStimLocalConfig): void {
  const storage = getElectroStimStorage();
  if (!storage) {
    return;
  }
  storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cloneElectroStimLocalConfig(config)));
}

export function parseGameConnectionCode(gameConnectionCode: string): { clientId: string; baseUrl: string } | null {
  const normalized = gameConnectionCode.trim();
  const separatorIndex = normalized.indexOf("@");
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
    return null;
  }
  const clientId = normalized.slice(0, separatorIndex).trim();
  const baseUrl = normalized.slice(separatorIndex + 1).trim().replace(/\/+$/, "");
  if (!clientId || !/^https?:\/\//.test(baseUrl)) {
    return null;
  }
  return {
    clientId,
    baseUrl
  };
}

export function getAllowedPulses(config: ElectroStimLocalConfig): EStimPulse[] {
  const allowedIds = new Set(config.allowedPulseIds);
  return config.availablePulses.filter((item) => allowedIds.has(item.id));
}

function pulseNameById(config: ElectroStimLocalConfig): Map<string, string> {
  return new Map(config.availablePulses.map((item) => [item.id, item.name]));
}

function pulseIdByName(config: ElectroStimLocalConfig): Map<string, string> {
  return new Map(config.availablePulses.map((item) => [item.name.trim().toLowerCase(), item.id]));
}

async function requestLocalApi<T>(config: ElectroStimLocalConfig, path: string, init?: RequestInit): Promise<T> {
  const connection = parseGameConnectionCode(config.gameConnectionCode);
  if (!connection) {
    throw new Error("请先填写有效的游戏连接码。");
  }
  const response = await fetch(`${connection.baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === 0) {
    throw new Error(typeof payload.message === "string" && payload.message.trim()
      ? payload.message
      : `本地电击器接口调用失败：${response.status}`);
  }
  return payload as T;
}

export async function fetchElectroStimGameInfo(config: ElectroStimLocalConfig): Promise<GameInfoResponse> {
  const connection = parseGameConnectionCode(config.gameConnectionCode);
  if (!connection) {
    throw new Error("请先填写有效的游戏连接码。");
  }
  return requestLocalApi<GameInfoResponse>(config, `/api/v2/game/${connection.clientId}`);
}

export async function fetchElectroStimPulseList(config: ElectroStimLocalConfig): Promise<EStimPulse[]> {
  const connection = parseGameConnectionCode(config.gameConnectionCode);
  if (!connection) {
    throw new Error("请先填写有效的游戏连接码。");
  }
  const response = await requestLocalApi<PulseListResponse>(config, `/api/v2/game/${connection.clientId}/pulse_list`);
  return Array.isArray(response.pulseList) ? response.pulseList : [];
}

export async function testElectroStimConnection(config: ElectroStimLocalConfig): Promise<GameInfoResponse> {
  return fetchElectroStimGameInfo(config);
}

export async function initializeElectroStimToZero(config: ElectroStimLocalConfig): Promise<ToolContext> {
  const connection = parseGameConnectionCode(config.gameConnectionCode);
  if (!connection) {
    return buildElectroStimToolContext(config);
  }
  await requestLocalApi(config, `/api/v2/game/${connection.clientId}/strength`, {
    method: "POST",
    body: JSON.stringify({
      channels: {
        a: {
          strength: { set: 0 },
          randomStrength: { set: 0 }
        },
        ...(config.bChannelEnabled ? {
          b: {
            strength: { set: 0 },
            randomStrength: { set: 0 }
          }
        } : {})
      }
    })
  });
  const gameInfo = await fetchElectroStimGameInfo(config);
  return buildElectroStimToolContext(config, gameInfo);
}

export function buildElectroStimToolContext(config: ElectroStimLocalConfig, gameInfo?: GameInfoResponse): ToolContext {
  const connection = parseGameConnectionCode(config.gameConnectionCode);
  const pulseNames = pulseNameById(config);
  const currentPulseId = gameInfo?.currentPulseId ?? {};
  const clientStrength = gameInfo?.clientStrength ?? {};
  const gameChannels = gameInfo?.gameConfig?.channels ?? {};
  return {
    eStim: {
      gameConnectionCodeLabel: connection ? `${connection.clientId}@${connection.baseUrl}` : undefined,
      bChannelEnabled: config.bChannelEnabled,
      channelPlacements: {
        a: config.channelPlacements.a.trim() || undefined,
        b: config.channelPlacements.b.trim() || undefined
      },
      allowedPulses: getAllowedPulses(config),
      lastSyncedAt: gameInfo ? new Date().toISOString() : undefined,
      runtime: gameInfo ? {
        a: {
          enabled: true,
          strength: Math.max(0, Math.round(clientStrength.a?.strength ?? 0)),
          limit: Math.max(0, Math.round(clientStrength.a?.limit ?? 0)),
          tempStrength: Math.max(0, Math.round(clientStrength.a?.tempStrength ?? 0)),
          currentPulseId: typeof currentPulseId.a === "string" ? currentPulseId.a : undefined,
          currentPulseName: typeof currentPulseId.a === "string" ? pulseNames.get(currentPulseId.a) : undefined,
          fireStrengthLimit: typeof gameChannels.a?.fireStrengthLimit === "number"
            ? Math.round(gameChannels.a.fireStrengthLimit)
            : undefined
        },
        ...(config.bChannelEnabled ? {
          b: {
            enabled: Boolean(gameChannels.b?.enabled ?? true),
            strength: Math.max(0, Math.round(clientStrength.b?.strength ?? 0)),
            limit: Math.max(0, Math.round(clientStrength.b?.limit ?? 0)),
            tempStrength: Math.max(0, Math.round(clientStrength.b?.tempStrength ?? 0)),
            currentPulseId: typeof currentPulseId.b === "string" ? currentPulseId.b : undefined,
            currentPulseName: typeof currentPulseId.b === "string" ? pulseNames.get(currentPulseId.b) : undefined,
            fireStrengthLimit: typeof gameChannels.b?.fireStrengthLimit === "number"
              ? Math.round(gameChannels.b.fireStrengthLimit)
              : undefined
          }
        } : {})
      } : undefined
    }
  };
}

export async function syncElectroStimToolContext(config: ElectroStimLocalConfig): Promise<ToolContext> {
  const connection = parseGameConnectionCode(config.gameConnectionCode);
  if (!connection) {
    return buildElectroStimToolContext(config);
  }
  const gameInfo = await fetchElectroStimGameInfo(config);
  return buildElectroStimToolContext(config, gameInfo);
}

function roundStrengthFromPercent(limit: number | undefined, intensityPercent: number | undefined): number | undefined {
  if (typeof limit !== "number" || limit <= 0 || typeof intensityPercent !== "number") {
    return undefined;
  }
  return Math.max(0, Math.round((limit * intensityPercent) / 100));
}

export function mapIntensityPercentThroughCurve(
  curve: ElectroStimIntensityCurveConfig,
  intensityPercent: number | undefined
): number | undefined {
  if (typeof intensityPercent !== "number") {
    return undefined;
  }
  const clampedInput = clampPercent(intensityPercent);
  const points = normalizeElectroStimIntensityCurve(curve).points;
  if (clampedInput <= points[0].inputPercent) {
    return points[0].outputPercent;
  }
  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const nextPoint = points[index];
    if (clampedInput > nextPoint.inputPercent) {
      continue;
    }
    const progress = (clampedInput - previousPoint.inputPercent) / (nextPoint.inputPercent - previousPoint.inputPercent);
    return clampPercent(previousPoint.outputPercent + (nextPoint.outputPercent - previousPoint.outputPercent) * progress);
  }
  return points[points.length - 1].outputPercent;
}

function mapIntensityPercentForConfig(
  config: ElectroStimLocalConfig,
  intensityPercent: number | undefined
): number | undefined {
  return mapIntensityPercentThroughCurve(config.intensityCurve, intensityPercent);
}

function resolvePulseId(config: ElectroStimLocalConfig, pulseName: string | undefined): string | undefined {
  if (!pulseName) {
    return undefined;
  }
  return pulseIdByName(config).get(pulseName.trim().toLowerCase());
}

export async function applyElectroStimToolEvent(
  config: ElectroStimLocalConfig,
  payload: Record<string, unknown>
): Promise<ElectroStimExecutionResult> {
  const connection = parseGameConnectionCode(config.gameConnectionCode);
  if (!connection) {
    return {
      status: "simulated",
      detail: "未配置有效游戏连接码，已按模拟执行展示。"
    };
  }

  const command = typeof payload.command === "string" ? payload.command : "";
  const sourceChannels = typeof payload.channels === "object" && payload.channels
    ? payload.channels as Record<string, Record<string, unknown> | undefined>
    : {};

  try {
    const currentInfo = await fetchElectroStimGameInfo(config);
    const mappingNotes: string[] = [];
    if (command === "set") {
      const strengthChannels: Record<string, unknown> = {};
      const pulseChannels: Record<string, unknown> = {};
      for (const channel of ["a", "b"] as ChannelKey[]) {
        const channelPayload = sourceChannels[channel];
        if (!channelPayload) {
          continue;
        }
        if (channel === "b" && !config.bChannelEnabled) {
          throw new Error("B 通道当前未启用，无法执行该控制。");
        }
        const requestedIntensityPercent = typeof channelPayload.intensityPercent === "number"
          ? clampPercent(channelPayload.intensityPercent)
          : undefined;
        const mappedIntensityPercent = mapIntensityPercentForConfig(config, requestedIntensityPercent);
        const actualStrength = roundStrengthFromPercent(
          currentInfo.clientStrength?.[channel]?.limit,
          mappedIntensityPercent
        );
        if (actualStrength !== undefined) {
          strengthChannels[channel] = {
            strength: { set: actualStrength },
            randomStrength: { set: 0 }
          };
          if (
            typeof requestedIntensityPercent === "number"
            && typeof mappedIntensityPercent === "number"
            && requestedIntensityPercent !== mappedIntensityPercent
          ) {
            mappingNotes.push(`${channel.toUpperCase()} ${requestedIntensityPercent}% -> ${mappedIntensityPercent}%`);
          }
        }
        const pulseId = resolvePulseId(
          config,
          typeof channelPayload.pulseName === "string" ? channelPayload.pulseName : undefined
        );
        if (typeof channelPayload.pulseName === "string" && !pulseId) {
          throw new Error(`找不到波形“${channelPayload.pulseName}”对应的 pulseId。`);
        }
        if (pulseId) {
          pulseChannels[channel] = {
            pulseId
          };
        }
      }
      if (Object.keys(strengthChannels).length > 0) {
        await requestLocalApi(config, `/api/v2/game/${connection.clientId}/strength`, {
          method: "POST",
          body: JSON.stringify({
            channels: strengthChannels
          })
        });
      }
      if (Object.keys(pulseChannels).length > 0) {
        await requestLocalApi(config, `/api/v2/game/${connection.clientId}/pulse`, {
          method: "POST",
          body: JSON.stringify({
            channels: pulseChannels
          })
        });
      }
    } else if (command === "fire") {
      const fireChannels: Record<string, unknown> = {};
      for (const channel of ["a", "b"] as ChannelKey[]) {
        const channelPayload = sourceChannels[channel];
        if (!channelPayload) {
          continue;
        }
        if (channel === "b" && !config.bChannelEnabled) {
          throw new Error("B 通道当前未启用，无法执行该控制。");
        }
        const pulseId = resolvePulseId(
          config,
          typeof channelPayload.pulseName === "string" ? channelPayload.pulseName : undefined
        );
        if (typeof channelPayload.pulseName === "string" && !pulseId) {
          throw new Error(`找不到波形“${channelPayload.pulseName}”对应的 pulseId。`);
        }
        const requestedIntensityPercent = typeof channelPayload.intensityPercent === "number"
          ? clampPercent(channelPayload.intensityPercent)
          : undefined;
        const mappedIntensityPercent = mapIntensityPercentForConfig(config, requestedIntensityPercent);
        const fireStrength = roundStrengthFromPercent(
          currentInfo.clientStrength?.[channel]?.limit,
          mappedIntensityPercent
        );
        fireChannels[channel] = {
          ...(typeof channelPayload.enabled === "boolean" ? { enabled: channelPayload.enabled } : {}),
          ...(fireStrength !== undefined ? { strength: fireStrength } : {}),
          ...(pulseId ? { pulseId } : {})
        };
        if (
          typeof requestedIntensityPercent === "number"
          && typeof mappedIntensityPercent === "number"
          && requestedIntensityPercent !== mappedIntensityPercent
        ) {
          mappingNotes.push(`${channel.toUpperCase()} ${requestedIntensityPercent}% -> ${mappedIntensityPercent}%`);
        }
      }
      await requestLocalApi(config, `/api/v2/game/${connection.clientId}/action/fire`, {
        method: "POST",
        body: JSON.stringify({
          time: typeof payload.durationMs === "number" ? payload.durationMs : 5000,
          override: payload.override !== false,
          channels: fireChannels
        })
      });
    } else {
      return {
        status: "simulated",
        detail: "未识别的电击器命令，已跳过本地执行。"
      };
    }

    const nextInfo = await fetchElectroStimGameInfo(config);
    return {
      status: "success",
      detail: mappingNotes.length > 0
        ? `已调用本地电击器接口，并应用力度曲线映射：${mappingNotes.join("，")}。`
        : "已调用本地电击器接口。",
      toolContext: buildElectroStimToolContext(config, nextInfo)
    };
  } catch (error) {
    return {
      status: "error",
      detail: error instanceof Error ? error.message : "本地电击器接口调用失败。"
    };
  }
}
