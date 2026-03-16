import { Router } from "express";
import { ConfigService } from "../services/ConfigService.js";

export function createConfigRoutes(configService: ConfigService): Router {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      response.json(await configService.getConfig());
    } catch (error) {
      next(error);
    }
  });

  router.put("/", async (request, response, next) => {
    try {
      response.json(await configService.saveConfig(request.body));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

