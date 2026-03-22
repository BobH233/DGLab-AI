import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAuthMiddleware, isValidAuthPassword } from "../lib/auth.js";
import { createAuthRoutes } from "../routes/authRoutes.js";

type MockRequest = {
  body?: unknown;
  method?: string;
  query?: Record<string, unknown>;
  header(name: string): string | undefined;
};

function createRequest(options: {
  body?: unknown;
  method?: string;
  headers?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
} = {}): MockRequest {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(options.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    body: options.body,
    method: options.method ?? "GET",
    query: options.query ?? {},
    header(name: string) {
      return normalizedHeaders[name.toLowerCase()];
    }
  };
}

function getLoginHandler() {
  const router = createAuthRoutes() as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (request: MockRequest, response: { json: (body: unknown) => void }, next: (error?: unknown) => void) => void }>;
      };
    }>;
  };

  const loginLayer = router.stack.find((layer) => layer.route?.path === "/login" && layer.route.methods.post);
  if (!loginLayer?.route?.stack[0]) {
    throw new Error("POST /login handler not found");
  }
  return loginLayer.route.stack[0].handle;
}

describe("API auth", () => {
  const previousAuthPassword = process.env.AUTH_PASSWORD;

  beforeEach(() => {
    process.env.AUTH_PASSWORD = "super-secret";
  });

  afterEach(() => {
    if (previousAuthPassword === undefined) {
      delete process.env.AUTH_PASSWORD;
      return;
    }
    process.env.AUTH_PASSWORD = previousAuthPassword;
  });

  it("validates passwords from AUTH_PASSWORD", () => {
    expect(isValidAuthPassword("super-secret")).toBe(true);
    expect(isValidAuthPassword("wrong-password")).toBe(false);
  });

  it("rejects protected requests without a password", () => {
    const next = vi.fn();

    apiAuthMiddleware(
      createRequest() as never,
      {} as never,
      next
    );

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 401
    });
  });

  it("accepts the password from request headers and query params", () => {
    const headerNext = vi.fn();
    apiAuthMiddleware(
      createRequest({
        headers: {
          "x-auth-password": "super-secret"
        }
      }) as never,
      {} as never,
      headerNext
    );
    expect(headerNext).toHaveBeenCalledWith();

    const queryNext = vi.fn();
    apiAuthMiddleware(
      createRequest({
        query: {
          authPassword: "super-secret"
        }
      }) as never,
      {} as never,
      queryNext
    );
    expect(queryNext).toHaveBeenCalledWith();
  });

  it("accepts the correct password during login", () => {
    const response = {
      json: vi.fn()
    };
    const next = vi.fn();

    getLoginHandler()(
      createRequest({
        method: "POST",
        body: {
          password: "super-secret"
        }
      }) as never,
      response,
      next
    );

    expect(response.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects incorrect passwords during login", () => {
    const response = {
      json: vi.fn()
    };
    const next = vi.fn();

    getLoginHandler()(
      createRequest({
        method: "POST",
        body: {
          password: "wrong-password"
        }
      }) as never,
      response,
      next
    );

    expect(response.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 401
    });
  });
});
