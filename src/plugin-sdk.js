import {GATEWAY_CAPABILITIES} from "@categori/studio-contracts";

const PLUGIN_ID = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function checkedCapabilities(values) {
  if (!Array.isArray(values) || !values.length) {
    throw new TypeError("capabilities must be a non-empty array");
  }
  const selected = [...new Set(values)];
  if (selected.some((value) => !GATEWAY_CAPABILITIES.includes(value))) {
    throw new TypeError("plugin capability is not part of the public contract");
  }
  return Object.freeze(selected);
}

export function defineStudioPlugin(value) {
  if (!value || typeof value !== "object" || !PLUGIN_ID.test(value.id || "")) {
    throw new TypeError("plugin id must be a readable slug");
  }
  if (typeof value.version !== "string" || !/^\d+\.\d+\.\d+$/.test(value.version)) {
    throw new TypeError("plugin version must be semantic x.y.z");
  }
  return Object.freeze({
    id: value.id,
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : value.id,
    version: value.version,
    capabilities: checkedCapabilities(value.capabilities),
    activate: typeof value.activate === "function" ? value.activate : () => Object.freeze({})
  });
}

export function defineProviderAdapter(value) {
  const plugin = defineStudioPlugin(value);
  if (typeof value.invoke !== "function") {
    throw new TypeError("provider adapter must implement invoke(request)");
  }
  return Object.freeze({...plugin, invoke: value.invoke});
}
