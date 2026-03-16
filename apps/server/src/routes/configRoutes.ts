import { Router } from "express";
import { ConfigService } from "../services/ConfigService.js";

export function createConfigRoutes(configService: ConfigService): Router {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      response.json(await configService.getAppConfig());
    } catch (error) {
      next(error);
    }
  });

  router.put("/", async (request, response, next) => {
    try {
      response.json(await configService.saveAppConfig(request.body));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/active-backend", async (request, response, next) => {
    try {
      response.json(await configService.setActiveBackend(request.body));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
