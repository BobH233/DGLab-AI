import {
  createDefaultModelBackend,
  defaultToolStates,
  normalizeAppConfig,
  type AppConfig,
  type LlmConfig
} from "@dglab-ai/shared";
import { describe, expect, it } from "vitest";
import { ConfigService } from "../services/ConfigService.js";

const activeConfig: LlmConfig = {
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test-key",
  model: "gpt-4.1-mini",
  temperature: 0.9,
  maxTokens: 1200,
  topP: 1,
  requestTimeoutMs: 120000,
  toolStates: defaultToolStates()
};

class ConfigStoreStub {
  public appConfig: AppConfig = normalizeAppConfig({
    activeBackendId: "primary",
    backends: [
      {
        ...createDefaultModelBackend(),
        ...activeConfig,
        id: "primary",
        name: "主模型"
      },
      {
        ...createDefaultModelBackend(),
        ...activeConfig,
        id: "backup",
        name: "备用模型",
        model: "gpt-4.1"
      }
    ]
  });

  async init() {}
  async getConfig() { return activeConfig; }
  async saveConfig(config: LlmConfig) { return config; }
  async getAppConfig() { return this.appConfig; }
  async saveAppConfig(config: AppConfig) {
    this.appConfig = config;
    return config;
  }
  async listSessions() { return []; }
  async createSession() { throw new Error("not implemented"); }
  async getSession() { return null; }
  async replaceSession() {}
  async appendEvents() { return []; }
  async getEvents() { return []; }
  async listSchedulableSessions() { return []; }
}

describe("ConfigService", () => {
  it("saves multiple backends and normalizes tool states", async () => {
    const store = new ConfigStoreStub();
    const service = new ConfigService(store as never);

    const saved = await service.saveAppConfig({
      activeBackendId: "backup",
      backends: [
        {
          ...store.appConfig.backends[0],
          toolStates: {
            control_vibe_toy: false,
            speak_to_player: false
          }
        },
        store.appConfig.backends[1]
      ]
    });

    expect(saved.activeBackendId).toBe("backup");
    expect(saved.backends).toHaveLength(2);
    expect(saved.backends[0]?.toolStates.speak_to_player).toBe(true);
    expect(saved.backends[0]?.toolStates.control_vibe_toy).toBe(false);
  });

  it("switches the active backend by id", async () => {
    const store = new ConfigStoreStub();
    const service = new ConfigService(store as never);

    const saved = await service.setActiveBackend({ backendId: "backup" });

    expect(saved.activeBackendId).toBe("backup");
  });

  it("rejects switching to a missing backend", async () => {
    const store = new ConfigStoreStub();
    const service = new ConfigService(store as never);

    await expect(service.setActiveBackend({ backendId: "missing" })).rejects.toMatchObject({
      statusCode: 404
    });
  });
});
