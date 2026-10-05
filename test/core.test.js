import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  createLocalStudio,
  createMockProvider,
  defineProviderAdapter,
  defineStudioPlugin
} from "../src/index.js";
import {contextHref, readStudioContext} from "../src/navigation.js";
import {parseStudioDocument} from "../src/project-files.js";

const project = {
  schemaVersion: 1,
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

const governedProject = {
  ...project,
  dataSensitivity: "internal",
  resources: [
    {id: "public-brief", kind: "document", uri: "brief.md", sensitivity: "public"},
    {id: "private-evidence", kind: "document", uri: "evidence.md", sensitivity: "confidential"}
  ],
  agentProfiles: [
    {id: "reviewer", instructionsPath: "instructions/reviewer.md", allowedTools: ["read_file", "search"]},
    {id: "editor", instructionsPath: "instructions/editor.md", allowedTools: ["read_file", "write_file"]}
  ]
};

const reviewedBudget = Object.freeze({
  max_runtime_seconds: 60,
  max_model_turns: 2,
  max_completion_tokens_per_turn: 512,
  max_provider_charge_cents: 0
});

function recordingProvider(capabilities = ["plan"]) {
  const invocations = [];
  const provider = defineProviderAdapter({
    id: "local-test-provider",
    name: "Local test provider",
    version: "1.0.0",
    capabilities,
    async invoke(request) {
      invocations.push(request);
      return Object.freeze({status: "SUCCEEDED", usage: Object.freeze({estimatedCost: 0})});
    }
  });
  return {provider, invocations};
}

function governedStudio(capabilities) {
  const recorded = recordingProvider(capabilities);
  return {
    ...recorded,
    studio: createLocalStudio({
      projects: [governedProject],
      provider: recorded.provider,
      runPolicy: {budget: reviewedBudget}
    })
  };
}

function governedRequest(changes = {}) {
  return {
    capability: "plan",
    projectId: governedProject.id,
    modelPolicy: governedProject.modelPolicy,
    sensitivity: "confidential",
    tools: ["read_file"],
    ...changes
  };
}

test("local studio passes only the registered policy and a bounded budget to an adapter", async () => {
  const {studio, invocations} = governedStudio();
  await studio.run(governedRequest({budget: {max_runtime_seconds: 15}}));
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].sensitivity, "confidential");
  assert.equal(invocations[0].modelPolicy.mode, "local_only");
  assert.deepEqual(invocations[0].tools, ["read_file"]);
  assert.deepEqual(invocations[0].budget, {...reviewedBudget, max_runtime_seconds: 15});
  assert.deepEqual(studio.listRuns()[0].request.budget, invocations[0].budget);
});

test("local studio rejects project-policy loosening before invoking an adapter", async () => {
  const {studio, invocations} = governedStudio(["plan", "edit"]);
  const rejected = [
    governedRequest({sensitivity: "internal"}),
    governedRequest({sensitivity: "restricted"}),
    governedRequest({modelPolicy: {mode: "balanced_cost"}}),
    governedRequest({tools: ["search"]}),
    governedRequest({tools: ["write_file"]}),
    governedRequest({tools: ["read_file", 7]})
  ];
  for (const request of rejected) {
    await assert.rejects(() => studio.run(request), /sensitivity|model policy|tools|capability/);
  }
  assert.equal(invocations.length, 0);
});

test("local studio rejects unsupported adapter capabilities before invoke", async () => {
  const {studio, invocations} = governedStudio(["plan"]);
  await assert.rejects(
    () => studio.run(governedRequest({capability: "edit"})),
    /does not support the requested capability/
  );
  assert.equal(invocations.length, 0);
});

test("local studio rejects unknown, invalid, and oversized budgets before invoke", async () => {
  const {studio, invocations} = governedStudio();
  const rejected = [
    {unknown_limit: 1},
    {max_runtime_seconds: 61},
    {max_model_turns: -1},
    {max_completion_tokens_per_turn: 1.5},
    {max_provider_charge_cents: "0"}
  ];
  for (const budget of rejected) {
    await assert.rejects(() => studio.run(governedRequest({budget})), /budget/);
  }
  await assert.rejects(() => studio.run(governedRequest({budget: []})), /budget/);
  assert.equal(invocations.length, 0);
});

test("custom providers fail closed without a complete reviewed run policy", () => {
  const {provider} = recordingProvider();
  assert.throws(
    () => createLocalStudio({projects: [governedProject], provider}),
    /complete budget ceiling/
  );
  assert.throws(
    () => createLocalStudio({
      projects: [governedProject],
      provider,
      runPolicy: {budget: {...reviewedBudget, extra_limit: 1}}
    }),
    /unsupported fields/
  );
  assert.throws(
    () => createLocalStudio({
      projects: [governedProject],
      provider,
      runPolicy: {budget: {max_runtime_seconds: 1}}
    }),
    /missing required fields/
  );
  const impostor = defineProviderAdapter({
    id: "mock-provider",
    version: "1.0.0",
    capabilities: ["plan"],
    async invoke() {
      throw new Error("must not be invoked");
    }
  });
  assert.throws(
    () => createLocalStudio({projects: [governedProject], provider: impostor}),
    /complete budget ceiling/
  );
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

test("public CI scans first and the source quick start pins exact release tags", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes("npm run check:public-tree --prefix studio-core"));
  assert.ok(workflow.indexOf("check:public-tree") < workflow.indexOf("npm install"));

  const packageMetadata = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const dependency = "@categori/studio-contracts";
  assert.equal(packageMetadata.dependencies[dependency], packageMetadata.version);
  const ci = parseStudioDocument(workflow, {filename: "ci.yml"});
  const checkouts = Object.values(ci.jobs).flatMap((job) => job.steps || [])
    .filter((step) => step.with?.repository === "categori-se/ai-studio-contracts");
  assert.equal(checkouts.length, 1, "CI must select one exact Contracts release");
  assert.equal(checkouts[0].with.ref, `v${packageMetadata.dependencies[dependency]}`,
    "CI must test the same Contracts release declared by the package");

  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.equal((readme.match(/git clone --branch v0\.5\.0 --depth 1/g) || []).length, 2);
  assert.doesNotMatch(readme, /git clone https:\/\/github\.com\/categori-se\/studio-/);
});
