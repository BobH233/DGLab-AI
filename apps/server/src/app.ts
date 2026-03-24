import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { OpenAICompatibleProvider } from "./infra/OpenAICompatibleProvider.js";
import { MongoSessionStore } from "./infra/mongo.js";
import { apiAuthMiddleware } from "./lib/auth.js";
import { FilePromptTemplateService } from "./infra/PromptTemplateService.js";
import { WebChannelAdapter } from "./infra/WebChannelAdapter.js";
import { isHttpError } from "./lib/errors.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createConfigRoutes } from "./routes/configRoutes.js";
import { createLlmCallRoutes } from "./routes/llmCallRoutes.js";
import { createSessionRoutes } from "./routes/sessionRoutes.js";
import { createTtsRoutes } from "./routes/ttsRoutes.js";
import { ConfigService } from "./services/ConfigService.js";
import { LlmCallService } from "./services/LlmCallService.js";
import { DefaultOrchestratorService } from "./services/OrchestratorService.js";
import { MemoryContextAssembler } from "./services/MemoryContextAssembler.js";
import { MemoryService } from "./services/MemoryService.js";
import { SchedulerService } from "./services/SchedulerService.js";
import { SessionService } from "./services/SessionService.js";
import { TtsService } from "./services/TtsService.js";
import { createDefaultToolRegistry } from "./tools/defaultTools.js";

export async function createServerApp() {
  const store = new MongoSessionStore(
    process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
    process.env.MONGODB_DB ?? "dglab_ai"
  );
  await store.init();
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const webDistDir = path.resolve(currentDir, "../../web/dist");
  const promptDir = path.resolve(currentDir, "prompts");
  const promptService = new FilePromptTemplateService(
    promptDir
  );
  const provider = new OpenAICompatibleProvider(store);
  const channel = new WebChannelAdapter();
  const toolRegistry = createDefaultToolRegistry();
  const orchestrator = new DefaultOrchestratorService(provider, promptService, toolRegistry, store);
  const memoryService = new MemoryService(provider);
  const memoryContextAssembler = new MemoryContextAssembler();
  const configService = new ConfigService(store);
  const sessionService = new SessionService(
    store,
    channel,
    orchestrator,
    promptService,
    memoryService,
    memoryContextAssembler
  );
  const scheduler = new SchedulerService(sessionService);
  const llmCallService = new LlmCallService(store);
  const ttsService = new TtsService(store);
  sessionService.attachScheduler(scheduler);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/auth", createAuthRoutes());
  app.use("/api", apiAuthMiddleware);
  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });
  app.use("/api/config", createConfigRoutes(configService));
  app.use("/api/llm-calls", createLlmCallRoutes(llmCallService));
  app.use("/api/sessions", createSessionRoutes(sessionService, channel));
  app.use("/api/tts", createTtsRoutes(ttsService));

  if (existsSync(webDistDir)) {
    app.use(express.static(webDistDir));
    app.get("*", (request, response, next) => {
      if (request.path.startsWith("/api")) {
        next();
        return;
      }
      response.sendFile(path.join(webDistDir, "index.html"));
    });
  }

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (isHttpError(error)) {
      response.status(error.statusCode).json({ message: error.message });
      return;
    }
    console.error(error);
    response.status(500).json({ message: error instanceof Error ? error.message : "Internal server error" });
  });

  return app;
}
