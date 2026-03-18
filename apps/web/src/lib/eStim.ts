import type { EStimPulse, ToolContext } from "@dglab-ai/shared";

const LOCAL_STORAGE_KEY = "dglabai.e_stim_config";

type ChannelKey = "a" | "b";

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
    availablePulses: [],
    allowedPulseIds: []
  };
}

export function loadElectroStimLocalConfig(): ElectroStimLocalConfig {
  if (typeof window === "undefined") {
    return createDefaultElectroStimLocalConfig();
  }
  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
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
      availablePulses: Array.isArray(parsed.availablePulses) ? parsed.availablePulses : [],
      allowedPulseIds: Array.isArray(parsed.allowedPulseIds) ? parsed.allowedPulseIds : []
    };
  } catch {
    return createDefaultElectroStimLocalConfig();
  }
}

export function saveElectroStimLocalConfig(config: ElectroStimLocalConfig): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config));
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
        const actualStrength = roundStrengthFromPercent(
          currentInfo.clientStrength?.[channel]?.limit,
          typeof channelPayload.intensityPercent === "number" ? channelPayload.intensityPercent : undefined
        );
        if (actualStrength !== undefined) {
          strengthChannels[channel] = {
            strength: { set: actualStrength },
            randomStrength: { set: 0 }
          };
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
        fireChannels[channel] = {
          ...(typeof channelPayload.enabled === "boolean" ? { enabled: channelPayload.enabled } : {}),
          ...(roundStrengthFromPercent(
            currentInfo.clientStrength?.[channel]?.limit,
            typeof channelPayload.intensityPercent === "number" ? channelPayload.intensityPercent : undefined
          ) !== undefined ? {
            strength: roundStrengthFromPercent(
              currentInfo.clientStrength?.[channel]?.limit,
              typeof channelPayload.intensityPercent === "number" ? channelPayload.intensityPercent : undefined
            )
          } : {}),
          ...(pulseId ? { pulseId } : {})
        };
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
      detail: "已调用本地电击器接口。",
      toolContext: buildElectroStimToolContext(config, nextInfo)
    };
  } catch (error) {
    return {
      status: "error",
      detail: error instanceof Error ? error.message : "本地电击器接口调用失败。"
    };
  }
}
