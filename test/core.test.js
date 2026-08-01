import test from "node:test";
import assert from "node:assert/strict";
import {createLocalStudio, createMockProvider, defineStudioPlugin} from "../src/index.js";
import {contextHref, readStudioContext} from "../src/navigation.js";

const project = {
  id: "local-demo",
  name: "Local demo",
  repository: "example/local-demo",
  defaultBranch: "main",
  commands: {checks: []},
  modelPolicy: {mode: "local_only"}
};

test("local studio runs without a hosted service", async () => {
  const studio = createLocalStudio({projects: [project], provider: createMockProvider()});
  const result = await studio.run({
    capability: "plan",
    projectId: "local-demo",
    modelPolicy: {mode: "local_only"}
  });
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.usage.estimatedCost, 0);
  assert.equal(studio.listRuns().length, 1);
});

test("plugin SDK rejects undeclared capabilities", () => {
  assert.throws(() => defineStudioPlugin({
    id: "unsafe-plugin",
    version: "1.0.0",
    capabilities: ["production-deploy"]
  }), /public contract/);
});

test("navigation helpers are deterministic without browser globals", () => {
  assert.equal(readStudioContext("?application=local-demo").applicationId, "local-demo");
  assert.equal(contextHref("/projects", {applicationId: "local-demo"}), "/projects?application=local-demo");
});
