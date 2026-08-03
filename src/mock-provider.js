import {normalizeGatewayRequest} from "@categori/studio-contracts";
import {defineProviderAdapter} from "./plugin-sdk.js";

const BUILT_IN_MOCK_PROVIDERS = new WeakSet();

export function createMockProvider({latencyMs = 0} = {}) {
  const provider = defineProviderAdapter({
    id: "mock-provider",
    name: "Mock provider",
    version: "0.4.0",
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
  BUILT_IN_MOCK_PROVIDERS.add(provider);
  return provider;
}

// Membership is module-private, so a third-party adapter cannot obtain the
// reviewed, zero-charge default merely by copying the mock's public id.
export function isBuiltInMockProvider(provider) {
  return Boolean(provider) && BUILT_IN_MOCK_PROVIDERS.has(provider);
}
