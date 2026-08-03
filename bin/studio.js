#!/usr/bin/env node
import {inspectStudioPath} from "../src/project-files.js";

const USAGE = `Usage:
  studio validate [path] [--json]
  studio inspect [path]

Both commands are read-only. A directory may contain workspace.yaml or an
.ai-studio/project.yaml manifest.`;

function parseArguments(argv) {
  const command = argv[0];
  if (!command || command === "help" || command === "--help" || command === "-h") return {command: "help"};
  if (!new Set(["validate", "inspect"]).has(command)) throw new TypeError(`unsupported command: ${command}`);
  let path = ".";
  let json = command === "inspect";
  for (const argument of argv.slice(1)) {
    if (argument === "--json") json = true;
    else if (argument.startsWith("-")) throw new TypeError(`unsupported option: ${argument}`);
    else if (path !== ".") throw new TypeError("only one path may be supplied");
    else path = argument;
  }
  return {command, path, json};
}

function inspectionValue(inspection) {
  if (inspection.kind === "project") return {kind: inspection.kind, path: inspection.path, project: inspection.project};
  return {
    kind: inspection.kind,
    path: inspection.path,
    workspace: inspection.workspace,
    projects: inspection.projects.map((item) => ({path: item.path, project: item.project}))
  };
}

export async function main(argv = process.argv.slice(2), output = console) {
  const options = parseArguments(argv);
  if (options.command === "help") {
    output.log(USAGE);
    return 0;
  }
  const inspection = await inspectStudioPath(options.path);
  if (options.json) output.log(JSON.stringify(inspectionValue(inspection), null, 2));
  else if (inspection.kind === "workspace") output.log(`Valid workspace ${inspection.workspace.id} (${inspection.projects.length} projects)`);
  else output.log(`Valid project ${inspection.project.id}`);
  return 0;
}

if (import.meta.main) {
  main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(`studio: ${error.message}`);
      process.exitCode = 1;
    }
  );
}
