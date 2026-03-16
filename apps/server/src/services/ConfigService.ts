import { appConfigSchema, normalizeAppConfig, type AppConfig, type LlmConfig } from "@dglab-ai/shared";
import { z } from "zod";
import { HttpError } from "../lib/errors.js";
import type { SessionStore } from "../types/contracts.js";

const setActiveBackendSchema = z.object({
  backendId: z.string().min(1)
});

export class ConfigService {
  constructor(private readonly store: SessionStore) {}

  getConfig(): Promise<LlmConfig> {
    return this.store.getConfig();
  }

  getAppConfig(): Promise<AppConfig> {
    return this.store.getAppConfig();
  }

  async saveAppConfig(config: unknown): Promise<AppConfig> {
    const parsed = appConfigSchema.parse(config);
    return this.store.saveAppConfig(normalizeAppConfig(parsed));
  }

  async setActiveBackend(payload: unknown): Promise<AppConfig> {
    const { backendId } = setActiveBackendSchema.parse(payload);
    const appConfig = await this.store.getAppConfig();
    if (!appConfig.backends.some((backend) => backend.id === backendId)) {
      throw new HttpError(404, `Backend ${backendId} not found`);
    }
    return this.store.saveAppConfig({
      ...appConfig,
      activeBackendId: backendId
    });
  }
}
