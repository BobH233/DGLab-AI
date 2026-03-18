import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PromptTemplateService } from "../types/contracts.js";

const TEMPLATE_VERSIONS: Record<string, string> = {
  "shared_safety_preamble": "1.3.0",
  "r18_guidance": "1.0.0",
  "tool_contract": "2.3.0",
  "world_builder": "1.6.0",
  "director_agent": "1.2.0",
  "support_agent": "1.2.0",
  "ensemble_turn": "1.5.0"
};

export class FilePromptTemplateService implements PromptTemplateService {
  private readonly cache = new Map<string, string>();

  constructor(private readonly promptDir: string) {}

  async getTemplate(name: string): Promise<string> {
    const cached = this.cache.get(name);
    if (cached) {
      return cached;
    }
    const template = await readFile(path.join(this.promptDir, `${name}.md`), "utf8");
    this.cache.set(name, template);
    return template;
  }

  async render(name: string, data: Record<string, unknown>): Promise<string> {
    const template = await this.getTemplate(name);
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
      const value = data[key];
      if (value === undefined || value === null) {
        return "";
      }
      return typeof value === "string" ? value : JSON.stringify(value, null, 2);
    });
  }

  versions(): Record<string, string> {
    return { ...TEMPLATE_VERSIONS };
  }
}
