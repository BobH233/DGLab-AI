import { Router } from "express";
import {
  createDraftRequestSchema,
  postMessageRequestSchema,
  sessionToolContextRequestSchema,
  timerUpdateSchema,
  updateDraftRequestSchema
} from "@dglab-ai/shared";
import { SessionService } from "../services/SessionService.js";
import type { ChannelAdapter } from "../types/contracts.js";

export function createSessionRoutes(sessionService: SessionService, channel: ChannelAdapter): Router {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      response.json(await sessionService.listSessions());
    } catch (error) {
      next(error);
    }
  });

  router.post("/draft", async (request, response, next) => {
    try {
      const body = createDraftRequestSchema.parse(request.body);
      response.status(201).json(await sessionService.createDraft(body.playerBrief, body.toolContext));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/draft", async (request, response, next) => {
    try {
      const body = updateDraftRequestSchema.parse(request.body);
      response.json(await sessionService.updateDraft(request.params.id, body));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/confirm", async (request, response, next) => {
    try {
      const body = sessionToolContextRequestSchema.parse(request.body ?? {});
      response.json(await sessionService.confirmSession(request.params.id, body.toolContext));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (request, response, next) => {
    try {
      response.json(await sessionService.getSession(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/messages", async (request, response, next) => {
    try {
      const body = postMessageRequestSchema.parse(request.body);
      response.json(await sessionService.postPlayerMessageWithContext(request.params.id, body.text, body.toolContext));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/retry", async (request, response, next) => {
    try {
      const body = sessionToolContextRequestSchema.parse(request.body ?? {});
      response.json(await sessionService.retrySession(request.params.id, body.toolContext));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/auto-tick", async (request, response, next) => {
    try {
      const body = sessionToolContextRequestSchema.parse(request.body ?? {});
      response.json(await sessionService.requestAutoTick(request.params.id, body.toolContext));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/timer", async (request, response, next) => {
    try {
      const body = timerUpdateSchema.parse(request.body);
      response.json(await sessionService.updateTimer(request.params.id, body));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/events", async (request, response, next) => {
    try {
      const cursor = request.query.cursor ? Number(request.query.cursor) : undefined;
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      response.json(await sessionService.getEvents(request.params.id, cursor, limit));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/memory-debug", async (request, response, next) => {
    try {
      response.json(await sessionService.getMemoryDebug(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/stream", async (request, response, next) => {
    try {
      const session = await sessionService.getSession(request.params.id);
      const previewSnapshot = sessionService.getPreviewSnapshot(session.id);
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });
      channel.attach(session.id, response);
      response.write(`event: ready\ndata: ${JSON.stringify({ sessionId: session.id })}\n\n`);
      if (previewSnapshot) {
        response.write(`event: llm.preview.snapshot\ndata: ${JSON.stringify({ previewTurn: previewSnapshot })}\n\n`);
      }
      request.on("close", () => {
        channel.detach(session.id, response);
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
