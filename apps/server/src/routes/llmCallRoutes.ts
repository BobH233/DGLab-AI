import { Router } from "express";
import { LlmCallService } from "../services/LlmCallService.js";

export function createLlmCallRoutes(llmCallService: LlmCallService): Router {
  const router = Router();

  router.get("/", async (request, response, next) => {
    try {
      response.json(await llmCallService.listCalls(request.query));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
