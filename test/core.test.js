import test from "node:test";
import assert from "node:assert/strict";
import {createLocalWorkbench, createMockProvider, defineWorkbenchPlugin} from "../src/index.js";
import {contextHref, readWorkbenchContext} from "../src/navigation.js";

const project = {
  id: "local-demo",
  name: "Local demo",
  repository: "example/local-demo",
  defaultBranch: "main",
  commands: {checks: []},
  modelPolicy: {mode: "local_only"}
};

test("local workbench runs without a hosted service", async () => {
  const workbench = createLocalWorkbench({projects: [project], provider: createMockProvider()});
  const result = await workbench.run({
    capability: "plan",
    projectId: "local-demo",
    modelPolicy: {mode: "local_only"}
  });
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.usage.estimatedCost, 0);
  assert.equal(workbench.listRuns().length, 1);
});

test("plugin SDK rejects undeclared capabilities", () => {
  assert.throws(() => defineWorkbenchPlugin({
    id: "unsafe-plugin",
    version: "1.0.0",
    capabilities: ["production-deploy"]
  }), /public contract/);
});

test("navigation helpers are deterministic without browser globals", () => {
  assert.equal(readWorkbenchContext("?application=local-demo").applicationId, "local-demo");
  assert.equal(contextHref("/projects", {applicationId: "local-demo"}), "/projects?application=local-demo");
});
