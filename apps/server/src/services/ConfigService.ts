import { llmConfigSchema, type LlmConfig } from "@dglab-ai/shared";
import type { SessionStore } from "../types/contracts.js";

export class ConfigService {
  constructor(private readonly store: SessionStore) {}

  getConfig(): Promise<LlmConfig> {
    return this.store.getConfig();
  }

  async saveConfig(config: unknown): Promise<LlmConfig> {
    const parsed = llmConfigSchema.parse(config);
    return this.store.saveConfig(parsed);
  }
}

