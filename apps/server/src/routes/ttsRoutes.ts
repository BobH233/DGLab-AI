import { Router } from "express";
import { TtsService } from "../services/TtsService.js";

export function createTtsRoutes(ttsService: TtsService): Router {
  const router = Router();

  router.get("/health", async (_request, response, next) => {
    try {
      const baseUrl = typeof _request.query.baseUrl === "string" ? _request.query.baseUrl : undefined;
      response.json(await ttsService.checkHealth(baseUrl));
    } catch (error) {
      next(error);
    }
  });

  router.get("/references", async (request, response, next) => {
    try {
      const baseUrl = typeof request.query.baseUrl === "string" ? request.query.baseUrl : undefined;
      response.json(await ttsService.listReferences(baseUrl));
    } catch (error) {
      next(error);
    }
  });

  router.get("/sessions/:sessionId/events/:seq", async (request, response, next) => {
    try {
      const seq = Number(request.params.seq);
      const audio = await ttsService.synthesizeEventAudio(request.params.sessionId, seq);
      response.type(audio.mimeType);
      response.setHeader("x-tts-cache", audio.cacheHit ? "HIT" : "MISS");
      response.sendFile(audio.filePath);
    } catch (error) {
      next(error);
    }
  });

  router.get("/sessions/:sessionId/performance", async (request, response, next) => {
    try {
      response.json(await ttsService.getSessionPerformanceState(request.params.sessionId));
    } catch (error) {
      next(error);
    }
  });

  router.post("/sessions/:sessionId/performance/batch", async (request, response, next) => {
    try {
      response.json(await ttsService.startSessionBatchSynthesis(request.params.sessionId));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/sessions/:sessionId/performance/batch", async (request, response, next) => {
    try {
      response.json(await ttsService.cancelSessionBatchSynthesis(request.params.sessionId));
    } catch (error) {
      next(error);
    }
  });

  router.get("/sessions/:sessionId/readables/:readableId", async (request, response, next) => {
    try {
      const audio = await ttsService.synthesizeReadableAudio(
        request.params.sessionId,
        request.params.readableId
      );
      response.type(audio.mimeType);
      response.setHeader("x-tts-cache", audio.cacheHit ? "HIT" : "MISS");
      response.sendFile(audio.filePath);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
