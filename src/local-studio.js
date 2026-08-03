import {
  assertProject,
  DATA_SENSITIVITY,
  GATEWAY_CAPABILITIES,
  normalizeGatewayRequest
} from "@categori/studio-contracts";
import {createMockProvider, isBuiltInMockProvider} from "./mock-provider.js";

const RUN_BUDGET_FIELDS = Object.freeze([
  "max_runtime_seconds",
  "max_model_turns",
  "max_completion_tokens_per_turn",
  "max_provider_charge_cents"
]);

const MOCK_RUN_POLICY = Object.freeze({
  budget: Object.freeze({
    max_runtime_seconds: 30,
    max_model_turns: 1,
    max_completion_tokens_per_turn: 512,
    max_provider_charge_cents: 0
  })
});

const SENSITIVITY_RANK = new Map(DATA_SENSITIVITY.map((value, index) => [value, index]));

function objectValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizedRunPolicy(value) {
  if (!objectValue(value) || !objectValue(value.budget)) {
    throw new TypeError("runPolicy with a complete budget ceiling is required for this provider");
  }
  const unexpectedPolicyKeys = Object.keys(value).filter((key) => key !== "budget");
  if (unexpectedPolicyKeys.length) {
    throw new TypeError(`runPolicy contains unsupported fields: ${unexpectedPolicyKeys.join(", ")}`);
  }
  const unexpectedBudgetKeys = Object.keys(value.budget).filter(
    (key) => !RUN_BUDGET_FIELDS.includes(key)
  );
  if (unexpectedBudgetKeys.length) {
    throw new TypeError(`runPolicy budget contains unsupported fields: ${unexpectedBudgetKeys.join(", ")}`);
  }
  const missing = RUN_BUDGET_FIELDS.filter((field) => !Object.hasOwn(value.budget, field));
  if (missing.length) {
    throw new TypeError(`runPolicy budget is missing required fields: ${missing.join(", ")}`);
  }
  const budget = {};
  for (const field of RUN_BUDGET_FIELDS) {
    const selected = value.budget[field];
    if (!Number.isSafeInteger(selected) || selected < 0) {
      throw new TypeError(`runPolicy budget.${field} must be a bounded non-negative integer`);
    }
    budget[field] = selected;
  }
  return Object.freeze({budget: Object.freeze(budget)});
}

function normalizedRequestedBudget(value, ceiling) {
  if (value !== undefined && !objectValue(value)) {
    throw new TypeError("gateway budget must be an object");
  }
  const requested = value || {};
  const unexpected = Object.keys(requested).filter((field) => !RUN_BUDGET_FIELDS.includes(field));
  if (unexpected.length) {
    throw new TypeError(`gateway budget contains unsupported fields: ${unexpected.join(", ")}`);
  }
  const selected = {...ceiling};
  for (const [field, amount] of Object.entries(requested)) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new TypeError(`gateway budget.${field} must be a bounded non-negative integer`);
    }
    if (amount > ceiling[field]) {
      throw new TypeError(`gateway budget.${field} exceeds the registered ceiling`);
    }
    selected[field] = amount;
  }
  return Object.freeze(selected);
}

function providerCapabilities(provider) {
  if (!provider || typeof provider !== "object" || typeof provider.invoke !== "function") {
    throw new TypeError("provider must be a provider adapter with invoke(request)");
  }
  if (
    !Array.isArray(provider.capabilities)
    || provider.capabilities.length === 0
    || provider.capabilities.some((capability) => !GATEWAY_CAPABILITIES.includes(capability))
  ) {
    throw new TypeError("provider must declare supported gateway capabilities");
  }
  return new Set(provider.capabilities);
}

function registeredSensitivity(project) {
  let selected = project.dataSensitivity || "internal";
  for (const resource of project.resources || []) {
    const resourceSensitivity = resource.sensitivity || selected;
    if (SENSITIVITY_RANK.get(resourceSensitivity) > SENSITIVITY_RANK.get(selected)) {
      selected = resourceSensitivity;
    }
  }
  return selected;
}

function registeredTools(project) {
  const profiles = project.agentProfiles || [];
  if (!profiles.length) return new Set();
  const selected = new Set(profiles[0].allowedTools || []);
  for (const profile of profiles.slice(1)) {
    const allowed = new Set(profile.allowedTools || []);
    for (const tool of selected) {
      if (!allowed.has(tool)) selected.delete(tool);
    }
  }
  return selected;
}

function assertRequestedTools(value) {
  if (value === undefined) return;
  if (
    !Array.isArray(value)
    || value.some((tool) => typeof tool !== "string" || !tool.trim())
  ) {
    throw new TypeError("gateway tools must be an array of non-empty strings");
  }
}

export function createLocalStudio(options = {}) {
  const projects = options.projects || [];
  const provider = options.provider || createMockProvider();
  const runPolicy = normalizedRunPolicy(
    options.runPolicy === undefined && isBuiltInMockProvider(provider)
      ? MOCK_RUN_POLICY
      : options.runPolicy
  );
  const capabilities = providerCapabilities(provider);
  const registry = new Map(projects.map((project) => {
    const checked = assertProject(project);
    return [checked.id, checked];
  }));
  const runs = [];
  return Object.freeze({
    listProjects() {
      return [...registry.values()];
    },
    getProject(projectId) {
      return registry.get(projectId) || null;
    },
    registerProject(project) {
      const checked = assertProject(project);
      if (registry.has(checked.id)) throw new TypeError("project id is already registered");
      registry.set(checked.id, checked);
      return checked;
    },
    listRuns() {
      return structuredClone(runs);
    },
    async run(input) {
      assertRequestedTools(input?.tools);
      const request = normalizeGatewayRequest(input);
      const project = registry.get(request.projectId);
      if (!project) throw new TypeError("project is not registered locally");
      if (!capabilities.has(request.capability)) {
        throw new TypeError("provider adapter does not support the requested capability");
      }

      const sensitivity = registeredSensitivity(project);
      if (request.sensitivity !== sensitivity) {
        throw new TypeError("gateway sensitivity must exactly match the registered project sensitivity");
      }
      if (request.modelPolicy.mode !== project.modelPolicy.mode) {
        throw new TypeError("gateway model policy must exactly match the registered project policy");
      }

      const allowedTools = registeredTools(project);
      const unsupportedTools = request.tools.filter((tool) => !allowedTools.has(tool));
      if (unsupportedTools.length) {
        throw new TypeError(`gateway tools are not allowed by every registered project profile: ${unsupportedTools.join(", ")}`);
      }

      const budget = normalizedRequestedBudget(input.budget, runPolicy.budget);
      const governedRequest = Object.freeze({...request, budget});
      const result = await provider.invoke(governedRequest);
      runs.push(Object.freeze({request: governedRequest, result, recordedAt: new Date().toISOString()}));
      return result;
    }
  });
}
