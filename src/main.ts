import * as fs from "node:fs";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { compareCoverage, parseCoverageSummary, parseLcovLines, type Finding } from "./rules";

const MARKER = "<!-- simple-coverage-check -->";
const NAME = "Simple Coverage Check";

function formatFindings(findings: Finding[]): string {
  if (!findings.length) {
    return [MARKER, `## ${NAME}`, "", "Coverage is within the allowed drop versus base."].join("\n");
  }
  const rows = findings.map((f) => `| ${f.severity} | \`${f.ruleId}\` | ${f.file} | ${f.title} |`).join("\n");
  return [
    MARKER,
    `## ${NAME}`,
    "",
    `Found **${findings.length}** issue(s).`,
    "",
    "| Severity | Rule | Location | Detail |",
    "| --- | --- | --- | --- |",
    rows,
  ].join("\n");
}

async function upsertPrComment(token: string, body: string): Promise<void> {
  const { context } = github;
  if (context.eventName !== "pull_request" && context.eventName !== "pull_request_target") return;
  const issue_number = context.payload.pull_request?.number;
  if (!issue_number) return;
  const octokit = github.getOctokit(token);
  const { data: comments } = await octokit.rest.issues.listComments({ ...context.repo, issue_number });
  const existing = comments.find((c) => c.body?.includes(MARKER));
  if (existing) {
    await octokit.rest.issues.updateComment({ ...context.repo, comment_id: existing.id, body });
    return;
  }
  await octokit.rest.issues.createComment({ ...context.repo, issue_number, body });
}

async function fetchBaseFile(token: string, filePath: string): Promise<string | null> {
  const { context } = github;
  const base = context.payload.pull_request?.base?.sha;
  if (!base) return null;
  const octokit = github.getOctokit(token);
  try {
    const { data } = await octokit.rest.repos.getContent({ ...context.repo, path: filePath, ref: base });
    if (Array.isArray(data) || !("content" in data) || !data.content) return null;
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function pctFrom(text: string, path: string): number | null {
  if (path.endsWith("lcov.info")) return parseLcovLines(text);
  return parseCoverageSummary(text) ?? parseLcovLines(text);
}

async function run(): Promise<void> {
  const token = core.getInput("github-token") || process.env.GITHUB_TOKEN || "";
  const failOn = (core.getInput("fail-on") || "none").toLowerCase();
  const coveragePath = core.getInput("coverage-path") || "coverage/coverage-summary.json";
  const maxDrop = Number(core.getInput("max-drop") || "1");

  if (!fs.existsSync(coveragePath)) {
    core.info(`Coverage file not found at ${coveragePath} — run tests with coverage before this Action.`);
    core.setOutput("finding-count", "0");
    return;
  }

  const headText = fs.readFileSync(coveragePath, "utf8");
  const headPct = pctFrom(headText, coveragePath);
  if (headPct === null) {
    core.warning("Could not parse head coverage file.");
    core.setOutput("finding-count", "0");
    return;
  }

  const baseText = token ? await fetchBaseFile(token, coveragePath) : null;
  let findings: Finding[] = [];
  if (baseText) {
    const basePct = pctFrom(baseText, coveragePath);
    if (basePct !== null) findings = compareCoverage(basePct, headPct, maxDrop, coveragePath);
    else core.info("Could not parse base coverage — reporting head only.");
  } else {
    core.info(`Head lines coverage: ${headPct.toFixed(2)}% (no base file to compare).`);
  }

  const summary = formatFindings(findings);
  await core.summary.addRaw(summary + `\n\nHead lines coverage: **${headPct.toFixed(2)}%**`, true).write();
  for (const f of findings) {
    if (f.severity === "high") core.error(`${f.title} (${f.ruleId})`);
    else core.warning(`${f.title} (${f.ruleId})`);
  }
  if (token) {
    try {
      await upsertPrComment(token, summary);
    } catch (e) {
      core.warning(`Could not post PR comment: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  core.setOutput("finding-count", String(findings.length));
  const shouldFail =
    failOn === "high"
      ? findings.some((f) => f.severity === "high")
      : failOn === "medium"
        ? findings.some((f) => f.severity === "high" || f.severity === "medium")
        : false;
  if (shouldFail) core.setFailed(`simple-coverage-check: ${findings.length} finding(s)`);
  else core.info(`Done. ${findings.length} finding(s).`);
}

run().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)));
