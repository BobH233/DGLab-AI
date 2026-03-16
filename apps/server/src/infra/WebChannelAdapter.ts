import type { Response } from "express";
import type { SseEvent } from "@dglab-ai/shared";
import type { ChannelAdapter } from "../types/contracts.js";

export class WebChannelAdapter implements ChannelAdapter {
  private readonly listeners = new Map<string, Set<Response>>();

  publish(event: SseEvent): void {
    const responses = this.listeners.get(event.sessionId);
    if (!responses) {
      return;
    }
    const packet = `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
    for (const response of responses) {
      response.write(packet);
    }
  }

  attach(sessionId: string, response: Response): void {
    const group = this.listeners.get(sessionId) ?? new Set<Response>();
    group.add(response);
    this.listeners.set(sessionId, group);
  }

  detach(sessionId: string, response: Response): void {
    const group = this.listeners.get(sessionId);
    if (!group) {
      return;
    }
    group.delete(response);
    if (group.size === 0) {
      this.listeners.delete(sessionId);
    }
  }

  normalizeInbound(payload: unknown): { text: string } {
    const text = typeof payload === "object" && payload !== null && "text" in payload
      ? String((payload as { text: unknown }).text)
      : "";
    return { text };
  }
}

