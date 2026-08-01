import {normalizeGatewayRequest} from "@categori/workbench-contracts";
import {defineProviderAdapter} from "./plugin-sdk.js";

export function createMockProvider({latencyMs = 0} = {}) {
  return defineProviderAdapter({
    id: "mock-provider",
    name: "Mock provider",
    version: "0.1.0",
    capabilities: ["plan", "edit", "evaluate", "extract", "embed"],
    async invoke(input) {
      const request = normalizeGatewayRequest(input);
      if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
      return Object.freeze({
        schemaVersion: 1,
        provider: "mock-provider",
        model: "deterministic-local-demo",
        status: "SUCCEEDED",
        output: `Mock ${request.capability} completed for ${request.projectId}.`,
        usage: Object.freeze({inputUnits: 0, outputUnits: 0, estimatedCost: 0}),
        evidence: Object.freeze([])
      });
    }
  });
}
