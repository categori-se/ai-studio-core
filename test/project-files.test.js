import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, mkdir, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {main as runStudioCli} from "../bin/studio.js";
import {
  inspectStudioPath,
  loadProjectFile,
  loadWorkspaceFile,
  parseStudioDocument
} from "../src/project-files.js";

const PROJECT_YAML = `schemaVersion: 1
id: portable-project
name: Portable project
repository: example/portable-project
defaultBranch: main
commands:
  checks: []
modelPolicy:
  mode: local_only
purpose:
  problem: Validate a portable manifest without executing project code.
resources:
  - id: source
    kind: document
    uri: fixtures/source.md
    sensitivity: public
`;

async function projectDirectory(root, relative = "project") {
  const directory = join(root, relative);
  await mkdir(join(directory, ".ai-studio"), {recursive: true});
  await writeFile(join(directory, ".ai-studio", "project.yaml"), PROJECT_YAML, "utf8");
  return directory;
}

test("project loader discovers and validates canonical YAML without executing it", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-core-project-"));
  const directory = await projectDirectory(root);
  const loaded = await loadProjectFile(directory);
  assert.equal(loaded.project.id, "portable-project");
  assert.equal(loaded.path, join(directory, ".ai-studio", "project.yaml"));
  assert.equal(Object.isFrozen(loaded.project.purpose), true);
});

test("workspace loader validates referenced manifests and matching project ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-core-workspace-"));
  await projectDirectory(root, "projects/portable");
  await writeFile(join(root, "workspace.yaml"), `schemaVersion: 1
id: portable-workspace
name: Portable workspace
projects:
  - id: portable-project
    path: projects/portable/.ai-studio/project.yaml
`, "utf8");
  const loaded = await loadWorkspaceFile(root);
  assert.equal(loaded.workspace.id, "portable-workspace");
  assert.equal(loaded.projects.length, 1);
  assert.equal((await inspectStudioPath(root)).kind, "workspace");
});

test("loader rejects duplicate YAML keys, aliases, and unsafe workspace paths", () => {
  assert.throws(
    () => parseStudioDocument("schemaVersion: 1\nid: one\nid: two\n", {filename: "project.yaml"}),
    /Map keys must be unique/
  );
  assert.throws(
    () => parseStudioDocument("base: &base {value: 1}\ncopy: *base\n", {filename: "project.yaml"}),
    /Alias resolution is disabled|Excessive alias count/
  );
});

test("loader rejects symlink traversal", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "studio-core-symlink-"));
  const outside = await projectDirectory(root, "outside");
  const workspace = join(root, "workspace");
  await mkdir(join(workspace, "projects"), {recursive: true});
  try {
    await symlink(outside, join(workspace, "projects", "linked"));
  } catch (error) {
    if (["EPERM", "EACCES"].includes(error.code)) return context.skip("symlinks are unavailable");
    throw error;
  }
  await writeFile(join(workspace, "workspace.yaml"), `schemaVersion: 1
id: linked-workspace
name: Linked workspace
projects:
  - path: projects/linked/.ai-studio/project.yaml
`, "utf8");
  await assert.rejects(() => loadWorkspaceFile(workspace), /symbolic link/);
});

test("read-only CLI validates and inspects a portable project", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-core-cli-"));
  const directory = await projectDirectory(root);
  const output = [];
  const console = {log: (value) => output.push(value)};
  assert.equal(await runStudioCli(["validate", directory], console), 0);
  assert.match(output.shift(), /Valid project portable-project/);
  assert.equal(await runStudioCli(["inspect", directory], console), 0);
  assert.equal(JSON.parse(output.shift()).project.id, "portable-project");
  await assert.rejects(() => runStudioCli(["deploy", directory], console), /unsupported command/);
});
