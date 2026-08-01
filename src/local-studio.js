import {assertProject, normalizeGatewayRequest} from "@categori/studio-contracts";
import {createMockProvider} from "./mock-provider.js";

export function createLocalStudio({projects = [], provider = createMockProvider()} = {}) {
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
      const request = normalizeGatewayRequest(input);
      if (!registry.has(request.projectId)) throw new TypeError("project is not registered locally");
      const result = await provider.invoke(request);
      runs.push(Object.freeze({request, result, recordedAt: new Date().toISOString()}));
      return result;
    }
  });
}
