# Studio Core

A local-first, single-user foundation for inspecting evidence-to-release projects and running bounded provider adapters. Studio Core is designed for domain experts and the developers who support them: consultants, researchers, engineers, analysts, reviewers, and small technical teams that want a portable brief, evidence, evaluation, decision, and release structure without first operating a cloud control plane. A user can validate repository-owned manifests, register projects locally, exercise an integration with a deterministic mock, and embed the public shell or extension interfaces in another tool.

Studio Core includes:

- a read-only project and workspace manifest CLI;
- safe JSON/YAML loading that never executes project code;
- a local project registry and in-memory run history;
- a small provider-adapter and plugin interface;
- a deterministic mock provider for tests and demonstrations; and
- reusable navigation and browser-shell helpers.

It is not a production agent runner or deployment service. It has no login, credential store, repository mutation, merge, production deployment, or cloud-distribution capability.

## Portable project files

The `studio` command reads JSON or YAML without executing project code:

```bash
studio validate .
studio inspect ./workspace.yaml
```

A project directory is discovered through `.ai-studio/project.yaml` (with JSON/YML and root-level compatibility names also accepted). A workspace directory may contain `workspace.yaml` and reference project manifests by safe relative paths. The loader rejects malformed UTF-8, duplicate YAML keys, aliases, files over 512 KiB, symlink traversal, path escape, unknown manifest fields, and contract violations.

Both commands are read-only. JavaScript consumers can use `loadProjectFile`, `loadWorkspaceFile`, `inspectStudioPath`, and `parseStudioDocument` from `@categori/studio-core/project-files`.

## What you can build with it

- A repository check that makes missing ownership, evidence, evaluation, or approval policy visible before review.
- A private local Studio whose project format is not coupled to one model provider.
- A provider adapter tested against normalized requests and a deterministic fallback.
- A lightweight project index for a research, engineering, policy, assurance, or advisory team that is not ready for a shared SaaS control plane.

The core does not choose a professional methodology or claim to provide tenant isolation, durable multi-user audit, or production authorization. Domain rules belong in the repository-owned manifest and rubric; shared operational guarantees require a system around the library, not another helper function.

## Bounded local adapters

`createLocalStudio` enforces the registered project policy before it invokes an adapter. A request must use the project's effective data sensitivity and exact model-policy mode, its tools must be allowed by every declared agent profile, and the adapter must declare the requested capability. Intersecting profile tool lists prevents a caller from silently combining privileges from two different profiles while the gateway contract has no profile selector.

Custom adapters also require a local budget ceiling when the studio is created:

```js
const studio = createLocalStudio({
  projects: [project],
  provider,
  runPolicy: {
    budget: {
      max_runtime_seconds: 120,
      max_model_turns: 4,
      max_completion_tokens_per_turn: 1024,
      max_provider_charge_cents: 0
    }
  }
});
```

All four values are non-negative safe integers. A run may omit its budget and inherit these ceilings, or lower individual fields. Unknown fields, invalid values, and increases are rejected before `provider.invoke`. The package's deterministic mock is the only adapter with an internal default policy; copying its public id does not grant another adapter that exception.

## Source quick start

Node.js 24 or later is required. Until the first npm release, clone Contracts and Core as sibling directories and install the local contract package explicitly:

```bash
git clone --branch v0.4.0 --depth 1 https://github.com/categori-se/studio-contracts.git
git clone --branch v0.4.0 --depth 1 https://github.com/categori-se/studio-core.git
cd studio-core
npm install --no-save --package-lock=false ../studio-contracts
npm test
node ./bin/studio.js --help
```

The release-tag checkouts keep the local dependency graph on the reviewed 0.4.0 line. The `--no-save` and `--package-lock=false` flags keep the published dependency declaration unchanged while working from source. For a complete project manifest to inspect, continue with the [`studio-examples` quick start](https://github.com/categori-se/studio-examples#source-quick-start).

## Public core and managed control plane

Hosted identity, tenant authorization, encrypted connections, billing, centralized approvals and audit, private agent orchestration, deployment credentials, and production infrastructure are deliberately outside this package. The private hosted AI Studio supplies those shared operational capabilities while consuming a pinned public Core release; it is not a private fork or a requirement for using the local tools.

You do not need the hosted service to use the CLI, adapter SDK, mock provider, manifest loader, or shell helpers. Those pieces are suitable for a local workflow, a repository check, or a self-managed integration. A team may consider the managed control plane when secure multi-user connections and a cross-project decision trail become infrastructure it does not want to operate itself.

## Status and contributing

`package.json` identifies this source line as version 0.4.0. A checkout is the published v0.4.0 source release only when the repository's `v0.4.0` tag resolves to that exact commit; otherwise treat `main` as development. Earlier tags remain available for comparison and compatibility testing. The package has not been published to npm, so pin an exact Git tag or commit when consuming it.

[Open an issue](https://github.com/categori-se/studio-core/issues) for a reproducible local workflow, adapter limitation, or proposed extension point. Contributions must keep the core local-first and provider-neutral, include deterministic tests, and follow [`CONTRIBUTING.md`](./CONTRIBUTING.md). The repository is licensed under the Apache License, Version 2.0.
