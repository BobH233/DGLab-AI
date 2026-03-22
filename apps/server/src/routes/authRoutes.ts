import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../lib/errors.js";
import { isValidAuthPassword } from "../lib/auth.js";

const loginRequestSchema = z.object({
  password: z.string().min(1, "请输入访问密码")
});

export function createAuthRoutes(): Router {
  const router = Router();

  router.post("/login", (request, response, next) => {
    try {
      const body = loginRequestSchema.parse(request.body ?? {});
      if (!isValidAuthPassword(body.password)) {
        throw new HttpError(401, "访问密码不正确");
      }
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
