import { llmCallListQuerySchema, type LlmCallListResponse } from "@dglab-ai/shared";
import type { LlmCallStore } from "../types/contracts.js";

export class LlmCallService {
  constructor(private readonly store: LlmCallStore) {}

  async listCalls(query: unknown): Promise<LlmCallListResponse> {
    const parsed = llmCallListQuerySchema.parse(query);
    return this.store.listLlmCalls(parsed);
  }
}
