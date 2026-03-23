export type BuildInfo = {
  source: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  commitSha: string | null;
  commitShortSha: string | null;
  commitMessage: string | null;
  branch: string | null;
  repository: string | null;
  workflowName: string | null;
  runId: string | null;
  runNumber: string | null;
  runAttempt: string | null;
  runUrl: string | null;
  actor: string | null;
  eventName: string | null;
};

type BuildInfoPayload = Partial<Omit<BuildInfo, "durationMs">> & {
  durationMs?: string | number | null;
};

const BUILD_INFO_PATH = "/build-info.json";

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createBuildInfo(payload?: BuildInfoPayload): BuildInfo {
  return {
    source: normalizeString(payload?.source) ?? "unavailable",
    startedAt: normalizeString(payload?.startedAt),
    completedAt: normalizeString(payload?.completedAt),
    durationMs: normalizeNumber(payload?.durationMs),
    commitSha: normalizeString(payload?.commitSha),
    commitShortSha: normalizeString(payload?.commitShortSha),
    commitMessage: normalizeString(payload?.commitMessage),
    branch: normalizeString(payload?.branch),
    repository: normalizeString(payload?.repository),
    workflowName: normalizeString(payload?.workflowName),
    runId: normalizeString(payload?.runId),
    runNumber: normalizeString(payload?.runNumber),
    runAttempt: normalizeString(payload?.runAttempt),
    runUrl: normalizeString(payload?.runUrl),
    actor: normalizeString(payload?.actor),
    eventName: normalizeString(payload?.eventName)
  };
}

export const staticBuildInfo = createBuildInfo({
  source: import.meta.env.VITE_BUILD_SOURCE,
  startedAt: import.meta.env.VITE_BUILD_STARTED_AT,
  completedAt: import.meta.env.VITE_BUILD_COMPLETED_AT,
  durationMs: import.meta.env.VITE_BUILD_DURATION_MS,
  commitSha: import.meta.env.VITE_BUILD_COMMIT_SHA,
  commitShortSha: import.meta.env.VITE_BUILD_COMMIT_SHORT_SHA,
  commitMessage: import.meta.env.VITE_BUILD_COMMIT_MESSAGE,
  branch: import.meta.env.VITE_BUILD_BRANCH,
  repository: import.meta.env.VITE_BUILD_REPOSITORY,
  workflowName: import.meta.env.VITE_BUILD_WORKFLOW_NAME,
  runId: import.meta.env.VITE_BUILD_RUN_ID,
  runNumber: import.meta.env.VITE_BUILD_RUN_NUMBER,
  runAttempt: import.meta.env.VITE_BUILD_RUN_ATTEMPT,
  runUrl: import.meta.env.VITE_BUILD_RUN_URL,
  actor: import.meta.env.VITE_BUILD_ACTOR,
  eventName: import.meta.env.VITE_BUILD_EVENT_NAME
});

export async function loadBuildInfo(): Promise<BuildInfo> {
  const cacheKey = staticBuildInfo.runId ?? staticBuildInfo.commitShortSha ?? staticBuildInfo.commitSha ?? "local";
  try {
    const response = await fetch(`${BUILD_INFO_PATH}?v=${encodeURIComponent(cacheKey)}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`Unable to load build info (${response.status})`);
    }
    const payload = await response.json() as BuildInfoPayload;
    return createBuildInfo({
      ...staticBuildInfo,
      ...payload
    });
  } catch {
    return staticBuildInfo;
  }
}
