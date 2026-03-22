import type { RequestHandler } from "express";
import { HttpError } from "./errors.js";

const DEFAULT_AUTH_PASSWORD = "bobh888888";

function getExpectedAuthPassword(): string {
  return process.env.AUTH_PASSWORD ?? DEFAULT_AUTH_PASSWORD;
}

function getProvidedAuthPassword(request: {
  header(name: string): string | undefined;
  query: Record<string, unknown>;
}): string | undefined {
  const headerPassword = request.header("x-auth-password");
  if (headerPassword) {
    return headerPassword;
  }

  const authorization = request.header("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  const queryPassword = request.query.authPassword;
  return typeof queryPassword === "string" ? queryPassword : undefined;
}

export function isValidAuthPassword(password: string): boolean {
  return password === getExpectedAuthPassword();
}

export const apiAuthMiddleware: RequestHandler = (request, _response, next) => {
  if (request.method === "OPTIONS") {
    next();
    return;
  }

  if (!isValidAuthPassword(getProvidedAuthPassword(request) ?? "")) {
    next(new HttpError(401, "密码错误或尚未登录"));
    return;
  }

  next();
};
