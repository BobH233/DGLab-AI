import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

function normalizeString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeNumber(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const outputPath = path.resolve(
  process.cwd(),
  process.env.BUILD_INFO_OUTPUT ?? "apps/web/dist/build-info.json"
);

const payload = {
  source: normalizeString(process.env.VITE_BUILD_SOURCE) ?? "build-info.json",
  startedAt: normalizeString(process.env.VITE_BUILD_STARTED_AT),
  completedAt: normalizeString(process.env.VITE_BUILD_COMPLETED_AT),
  durationMs: normalizeNumber(process.env.VITE_BUILD_DURATION_MS),
  commitSha: normalizeString(process.env.VITE_BUILD_COMMIT_SHA),
  commitShortSha: normalizeString(process.env.VITE_BUILD_COMMIT_SHORT_SHA),
  commitMessage: normalizeString(process.env.VITE_BUILD_COMMIT_MESSAGE),
  branch: normalizeString(process.env.VITE_BUILD_BRANCH),
  repository: normalizeString(process.env.VITE_BUILD_REPOSITORY),
  workflowName: normalizeString(process.env.VITE_BUILD_WORKFLOW_NAME),
  runId: normalizeString(process.env.VITE_BUILD_RUN_ID),
  runNumber: normalizeString(process.env.VITE_BUILD_RUN_NUMBER),
  runAttempt: normalizeString(process.env.VITE_BUILD_RUN_ATTEMPT),
  runUrl: normalizeString(process.env.VITE_BUILD_RUN_URL),
  actor: normalizeString(process.env.VITE_BUILD_ACTOR),
  eventName: normalizeString(process.env.VITE_BUILD_EVENT_NAME)
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Wrote build metadata to ${outputPath}`);
