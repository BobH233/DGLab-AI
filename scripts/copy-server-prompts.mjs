import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const sourceDir = path.join(repoRoot, "apps/server/src/prompts");
const targetDir = path.join(repoRoot, "apps/server/dist/prompts");

await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
