const APPLICATION_ID = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROVIDER_ID = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const EVIDENCE_FILTERS = new Set(["terminal", "failed", "current-candidate", "unknown-candidate"]);
const ESTATE_FILTERS = new Set(["ready", "discovered", "unknown"]);

function valid(value, pattern) {
  return typeof value === "string" && pattern.test(value) ? value : "";
}

export function readWorkbenchContext(search = globalThis.location?.search || "") {
  const parameters = new URLSearchParams(search);
  const evidenceFilter = parameters.get("evidence") ?? "";
  const estateFilter = parameters.get("estate") ?? "";
  return {
    applicationId: valid(parameters.get("application") ?? "", APPLICATION_ID),
    runId: valid(parameters.get("run") ?? "", RUN_ID),
    providerId: valid(parameters.get("provider") ?? "", PROVIDER_ID),
    evidenceFilter: EVIDENCE_FILTERS.has(evidenceFilter) ? evidenceFilter : "",
    estateFilter: ESTATE_FILTERS.has(estateFilter) ? estateFilter : ""
  };
}

export function contextHref(path, {
  applicationId = "",
  runId = "",
  providerId = "",
  evidenceFilter = "",
  estateFilter = "",
  hash = ""
} = {}, base = globalThis.location?.href || "https://example.invalid/") {
  const target = new URL(path, base);
  target.search = "";
  target.hash = "";
  const application = valid(applicationId, APPLICATION_ID);
  const run = valid(runId, RUN_ID);
  const provider = valid(providerId, PROVIDER_ID);
  if (application) target.searchParams.set("application", application);
  if (run) target.searchParams.set("run", run);
  if (provider) target.searchParams.set("provider", provider);
  if (EVIDENCE_FILTERS.has(evidenceFilter)) target.searchParams.set("evidence", evidenceFilter);
  if (ESTATE_FILTERS.has(estateFilter)) target.searchParams.set("estate", estateFilter);
  if (hash) target.hash = hash;
  return `${target.pathname}${target.search}${target.hash}`;
}

export function updateContextLinks(context, root = globalThis.document) {
  if (!root) return;
  for (const link of root.querySelectorAll("a[data-workbench-context]")) {
    const nextContext = {...context};
    if ("contextClearApplication" in link.dataset) nextContext.applicationId = "";
    if ("contextClearRun" in link.dataset) nextContext.runId = "";
    if ("contextClearProvider" in link.dataset) nextContext.providerId = "";
    if ("contextClearEvidence" in link.dataset) nextContext.evidenceFilter = "";
    if ("contextClearEstate" in link.dataset) nextContext.estateFilter = "";
    if (link.dataset.contextEvidence !== undefined) nextContext.evidenceFilter = link.dataset.contextEvidence;
    if (link.dataset.contextEstate !== undefined) nextContext.estateFilter = link.dataset.contextEstate;
    link.href = contextHref(link.dataset.contextPath || link.getAttribute("href") || "/", {
      ...nextContext,
      hash: link.dataset.contextHash || ""
    }, globalThis.location?.href);
  }
}
