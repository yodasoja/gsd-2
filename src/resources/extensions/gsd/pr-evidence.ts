// Project/App: GSD-2
// File Purpose: Shared pull request evidence generator for GSD shipping paths.

export type PrChangeType = "feat" | "fix" | "refactor" | "test" | "docs" | "chore";

export interface PrEvidenceInput {
  milestoneId: string;
  milestoneTitle?: string;
  changeType?: PrChangeType;
  linkedIssue?: string;
  summaries?: string[];
  roadmapItems?: string[];
  metrics?: string[];
  testsRun?: string[];
  why?: string;
  how?: string;
  rollbackNotes?: string[];
  aiAssisted?: boolean;
}

export interface PrEvidence {
  title: string;
  body: string;
}

const CHANGE_TYPE_LABELS: Record<PrChangeType, string> = {
  feat: "New feature or capability",
  fix: "Bug fix",
  refactor: "Code restructuring",
  test: "Adding or updating tests",
  docs: "Documentation only",
  chore: "Build, CI, or tooling changes",
};

function normalizeList(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function changeTypeChecklist(selected: PrChangeType): string[] {
  return (Object.keys(CHANGE_TYPE_LABELS) as PrChangeType[]).map((type) => {
    const checked = type === selected ? "x" : " ";
    return `- [${checked}] \`${type}\` - ${CHANGE_TYPE_LABELS[type]}`;
  });
}

function bulletList(values: readonly string[], fallback: string): string {
  if (values.length === 0) return `- ${fallback}`;
  return values.map((value) => `- ${value}`).join("\n");
}

export function buildPrEvidence(input: PrEvidenceInput): PrEvidence {
  const milestoneTitle = input.milestoneTitle?.trim() || input.milestoneId;
  const changeType = input.changeType ?? "feat";
  const summaries = normalizeList(input.summaries);
  const roadmapItems = normalizeList(input.roadmapItems);
  const metrics = normalizeList(input.metrics);
  const testsRun = normalizeList(input.testsRun);
  const rollbackNotes = normalizeList(input.rollbackNotes);
  const linkedIssue = input.linkedIssue?.trim() || "Not specified. Add an issue link before marking this PR ready if CONTRIBUTING.md requires one.";
  const why = input.why?.trim() || "Milestone work is complete and ready for review.";
  const how = input.how?.trim() || "Generated from GSD milestone evidence and local workflow artifacts.";
  const title = `${changeType}: ${milestoneTitle}`;

  const sections: string[] = [
    "## TL;DR",
    "",
    `**What:** Ship milestone ${input.milestoneId} - ${milestoneTitle}`,
    `**Why:** ${why}`,
    `**How:** ${how}`,
    "",
    "## What",
    "",
    summaries.length > 0 ? summaries.join("\n\n") : `Milestone ${input.milestoneId} completed.`,
    "",
    "## Why",
    "",
    why,
    "",
    "## How",
    "",
    how,
    "",
    "## Linked Issue",
    "",
    linkedIssue,
  ];

  if (roadmapItems.length > 0) {
    sections.push("", "## Roadmap", "", roadmapItems.join("\n"));
  }

  if (metrics.length > 0) {
    sections.push("", "## Metrics", "", bulletList(metrics, "No metrics recorded."));
  }

  sections.push(
    "",
    "## Tests Run",
    "",
    bulletList(testsRun, "Not specified. Add exact verification commands before requesting review."),
    "",
    "## Change Type",
    "",
    ...changeTypeChecklist(changeType),
    "",
    "## Rollback And Compatibility",
    "",
    bulletList(rollbackNotes, "No behavior-changing rollback notes recorded."),
  );

  if (input.aiAssisted !== false) {
    sections.push("", "## AI Assistance Disclosure", "", "This PR was prepared with AI assistance.");
  }

  return { title, body: sections.join("\n") };
}
