import {lstat, readFile, realpath} from "node:fs/promises";
import {isAbsolute, join, relative, resolve, sep} from "node:path";
import {TextDecoder} from "node:util";
import {assertProject, assertWorkspace, isSafeRelativePath} from "@categori/studio-contracts";
import {parseDocument} from "yaml";

export const PROJECT_MANIFEST_CANDIDATES = Object.freeze([
  ".ai-studio/project.yaml",
  ".ai-studio/project.yml",
  ".ai-studio/project.json",
  "project.yaml",
  "project.yml",
  "project.json"
]);
export const WORKSPACE_MANIFEST_CANDIDATES = Object.freeze(["workspace.yaml", "workspace.yml", "workspace.json"]);

const MAX_DOCUMENT_BYTES = 512 * 1024;
const UTF8 = new TextDecoder("utf-8", {fatal: true});

function inside(root, target) {
  const path = relative(root, target);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

async function optionalLstat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function assertNoSymlinkPath(root, target) {
  const path = relative(root, target);
  if (!inside(root, target)) throw new TypeError("manifest path escapes its workspace");
  let current = root;
  for (const part of path.split(sep).filter(Boolean)) {
    current = join(current, part);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) throw new TypeError(`symbolic links are not allowed in manifest paths: ${current}`);
  }
}

async function discover(directory, candidates, label) {
  for (const candidate of candidates) {
    const target = join(directory, candidate);
    const metadata = await optionalLstat(target);
    if (!metadata) continue;
    if (metadata.isSymbolicLink()) throw new TypeError(`${label} must not be a symbolic link: ${target}`);
    if (!metadata.isFile()) throw new TypeError(`${label} must be a regular file: ${target}`);
    await assertNoSymlinkPath(directory, target);
    return target;
  }
  throw new TypeError(`${label} was not found in ${directory}`);
}

async function documentPath(input, candidates, label) {
  const target = resolve(input);
  const metadata = await lstat(target);
  if (metadata.isSymbolicLink()) throw new TypeError(`${label} path must not be a symbolic link: ${target}`);
  const canonical = await realpath(target);
  if (canonical !== target) throw new TypeError(`${label} path must not traverse a symbolic link: ${target}`);
  if (metadata.isDirectory()) return discover(target, candidates, label);
  if (!metadata.isFile()) throw new TypeError(`${label} must be a regular file: ${target}`);
  return target;
}

async function readDocument(path) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new TypeError(`manifest must be a regular non-symlink file: ${path}`);
  if (metadata.size > MAX_DOCUMENT_BYTES) throw new TypeError(`manifest exceeds ${MAX_DOCUMENT_BYTES} bytes: ${path}`);
  const bytes = await readFile(path);
  try {
    return UTF8.decode(bytes);
  } catch {
    throw new TypeError(`manifest is not valid UTF-8: ${path}`);
  }
}

export function parseStudioDocument(source, {filename = "manifest.yaml"} = {}) {
  if (typeof source !== "string") throw new TypeError("manifest source must be a string");
  if (/\.json$/i.test(filename)) {
    try {
      return JSON.parse(source);
    } catch (error) {
      throw new SyntaxError(`${filename}: ${error.message}`);
    }
  }
  if (!/\.ya?ml$/i.test(filename)) throw new TypeError("manifest filename must end in .json, .yaml, or .yml");
  const document = parseDocument(source, {
    merge: false,
    prettyErrors: false,
    schema: "core",
    uniqueKeys: true
  });
  if (document.errors.length) throw new SyntaxError(`${filename}: ${document.errors.map((error) => error.message).join("; ")}`);
  try {
    return document.toJS({maxAliasCount: 0});
  } catch (error) {
    throw new SyntaxError(`${filename}: ${error.message}`);
  }
}

async function loadAndAssert(path, assertion) {
  const source = await readDocument(path);
  return assertion(parseStudioDocument(source, {filename: path}));
}

export async function loadProjectFile(input = ".", {workspaceRoot = null} = {}) {
  const path = await documentPath(input, PROJECT_MANIFEST_CANDIDATES, "project manifest");
  if (workspaceRoot) {
    const root = await realpath(workspaceRoot);
    await assertNoSymlinkPath(root, path);
    const canonical = await realpath(path);
    if (!inside(root, canonical)) throw new TypeError(`project manifest escapes its workspace: ${path}`);
  }
  const project = await loadAndAssert(path, assertProject);
  return Object.freeze({kind: "project", path, project});
}

export async function loadWorkspaceFile(input = ".") {
  const path = await documentPath(input, WORKSPACE_MANIFEST_CANDIDATES, "workspace manifest");
  const workspace = await loadAndAssert(path, assertWorkspace);
  const root = await realpath(resolve(path, ".."));
  const projects = [];
  for (const reference of workspace.projects) {
    if (!isSafeRelativePath(reference.path)) throw new TypeError(`unsafe project manifest path: ${reference.path}`);
    const target = resolve(root, reference.path);
    const loaded = await loadProjectFile(target, {workspaceRoot: root});
    if (reference.id && reference.id !== loaded.project.id) {
      throw new TypeError(`workspace project id ${reference.id} does not match ${loaded.project.id}`);
    }
    projects.push(loaded);
  }
  return Object.freeze({kind: "workspace", path, workspace, projects: Object.freeze(projects)});
}

export async function inspectStudioPath(input = ".") {
  const target = resolve(input);
  const metadata = await lstat(target);
  if (metadata.isSymbolicLink()) throw new TypeError(`Studio path must not be a symbolic link: ${target}`);
  if (metadata.isFile()) {
    return /^workspace\.(?:json|ya?ml)$/i.test(target.split(sep).at(-1))
      ? loadWorkspaceFile(target)
      : loadProjectFile(target);
  }
  if (!metadata.isDirectory()) throw new TypeError(`Studio path must be a file or directory: ${target}`);
  for (const candidate of WORKSPACE_MANIFEST_CANDIDATES) {
    if (await optionalLstat(join(target, candidate))) return loadWorkspaceFile(target);
  }
  return loadProjectFile(target);
}
