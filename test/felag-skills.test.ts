// The /felag skill widget layer is the Claude coupling (felag/skills/) and
// sits OUTSIDE the vendor-neutral src/ — but widget.mjs is a pure model→string
// function, so it's headless-testable without a browser or the show_widget
// tool. These are smoke tests over the rendered fragment's hard rules, not
// conformance (the widgets are presentation, an excluded surface).

import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM JS module, no .d.ts (Claude-coupling layer).
import {
  renderStatusWidget,
  renderReviewQueueWidget,
  renderVerifyWidget,
  renderAuditWidget,
  renderReviewWidget,
  renderRenderWidget,
  renderLintWidget,
} from "../felag/skills/widget.mjs";

// A small inline status model in the computeStatus shape.
const model = {
  name: "demo",
  version: "1.0.0",
  verdict: "conforms-with-waivers",
  scope: { kind: "whole" },
  counts: { conforming: 2, drifting: 1, proposed: 1 },
  contracts: [
    {
      id: "c-api",
      description: "the API contract",
      criteria: [
        { id: "ac-one", contractId: "c-api", itemId: "it1", force: "MUST", state: "active", status: "conforming", text: "Given a\nWhen b\nThen c", fixtures: ["fx-1"] },
        { id: "ac-two", contractId: "c-api", itemId: "it1", force: "SHOULD", state: "active", status: "drifting", text: "Given d\nThen e", fixtures: ["fx-2"] },
        { id: "ac-three", contractId: "c-api", itemId: "it2", force: "MUST", state: "proposed", status: "proposed", text: "Given f\nThen g", fixtures: [] },
      ],
    },
    {
      id: "(no contract)",
      description: "conduct and governance",
      criteria: [
        { id: "ac-judge", itemId: "it3", force: "MUST", state: "active", status: "conforming", text: "", fixtures: [] },
      ],
    },
  ],
};

const allIds = ["ac-one", "ac-two", "ac-three", "ac-judge"];

describe("renderStatusWidget", () => {
  const fragment: string = renderStatusWidget(model);

  it("is a fragment, not a full document", () => {
    expect(fragment.startsWith("<!doctype")).toBe(false);
    expect(fragment).not.toContain("<html");
  });

  it("opens with an sr-only h2 summary", () => {
    expect(fragment).toMatch(/^<div id="fw-status-\d+"[^>]*>\s*<h2 class="sr-only">/);
  });

  it("contains every criterion id", () => {
    for (const id of allIds) expect(fragment).toContain(id);
  });

  it("shows the summary counts", () => {
    expect(fragment).toContain("<b>2</b>"); // conforming
    expect(fragment).toContain("<b>1</b>"); // drifting / proposed
    expect(fragment).toContain("Conforming");
    expect(fragment).toContain("Proposed");
  });

  it("offers a Spec/Board toggle and whole-spec actions", () => {
    expect(fragment).toContain('data-view="spec"');
    expect(fragment).toContain('data-view="board"');
    expect(fragment).toContain("felag: re-verify");
    expect(fragment).toContain("felag: audit");
  });

  it("renders an empty-text criterion as a judgment criterion", () => {
    expect(fragment).toContain("(judgment criterion)");
  });

  it("has no leading-slash sendPrompt (a slash would trip command parsing)", () => {
    expect(fragment).not.toContain("sendPrompt('/");
    expect(fragment).not.toMatch(/felag:\s*\//);
  });

  it("hardcodes no text color — only status-dot/pill background glyphs", () => {
    // Every text hook is a Claude CSS var; the only literal colors are inline
    // `background:` on data glyphs. A `color:#hex` anywhere is the bug.
    expect(fragment).not.toMatch(/color\s*:\s*#/i);
  });
});

describe("renderReviewQueueWidget", () => {
  const fragment: string = renderReviewQueueWidget(model);

  it("shows only proposed criteria", () => {
    expect(fragment).toContain("ac-three"); // the one proposed
    for (const id of ["ac-one", "ac-two", "ac-judge"]) {
      expect(fragment).not.toContain(id);
    }
  });

  it("each proposed card has an approve button", () => {
    expect(fragment).toContain("Approve");
    expect(fragment).toContain("felag: approve proposed criterion ac-three");
  });

  it("opens with an sr-only h2 and is a fragment", () => {
    expect(fragment).toMatch(/<h2 class="sr-only">/);
    expect(fragment.startsWith("<!doctype")).toBe(false);
  });

  it("hardcodes no text color", () => {
    expect(fragment).not.toMatch(/color\s*:\s*#/i);
  });
});

// A drifting conformance report (the shape `felag verify` emits): criterion ids
// only, no force/state/text. Mirrors src/records.ts ConformanceReport.
const driftReport = {
  advisory: [{ criterionId: "ac-adv", verdict: "fail" }],
  conformanceVersion: "5.0.0",
  disputed: ["ac-disp"],
  failing: ["ac-fail-one", "ac-fail-two"],
  implementation: "demo-impl",
  verdict: "drifts",
  waived: ["ac-waived"],
};
const cleanReport = {
  advisory: [],
  conformanceVersion: "5.0.0",
  disputed: [],
  failing: [],
  implementation: "demo-impl",
  verdict: "conforms",
  waived: [],
};

describe("renderVerifyWidget", () => {
  const fragment: string = renderVerifyWidget(driftReport);

  it("is a fragment opening with an sr-only h2", () => {
    expect(fragment.startsWith("<!doctype")).toBe(false);
    expect(fragment).toMatch(/^<div id="fw-verify-\d+"[^>]*>\s*<h2 class="sr-only">/);
  });

  it("shows the verdict and the count strip", () => {
    expect(fragment).toContain("drifts");
    expect(fragment).toContain("Failing");
    expect(fragment).toContain("Waived");
    expect(fragment).toContain("Disputed");
  });

  it("contains every failing, waived, and disputed criterion id", () => {
    for (const id of ["ac-fail-one", "ac-fail-two", "ac-waived", "ac-disp"]) {
      expect(fragment).toContain(id);
    }
  });

  it("a failing card offers open-as-work and why-it-fails", () => {
    expect(fragment).toContain("felag: open ac-fail-one as work");
    expect(fragment).toContain("felag: show me why ac-fail-one fails");
  });

  it("the whole report offers re-verify", () => {
    expect(fragment).toContain("felag: re-verify demo-impl");
  });

  it("has no leading-slash sendPrompt", () => {
    expect(fragment).not.toContain("sendPrompt('/");
    expect(fragment).not.toMatch(/felag:\s*\//);
  });

  it("uses 0.5px borders and no hardcoded text color", () => {
    expect(fragment).toContain("0.5px");
    expect(fragment).not.toMatch(/color\s*:\s*#/i);
  });

  it("a clean conforms report is a one-line success state, not empty columns", () => {
    const clean: string = renderVerifyWidget(cleanReport);
    expect(clean).toContain("every gating criterion passes");
    expect(clean).not.toContain("Failing");
    expect(clean).toContain("felag: re-verify demo-impl");
  });
});

// An AuditResult (the shape `felag audit` emits): a report plus one proposal
// per failing gating criterion. Mirrors src/audit.ts AuditResult.
const auditResult = {
  report: { ...driftReport },
  proposals: [
    {
      specItemRef: "demo#it-one",
      criterionId: "ac-fail-one",
      title: "Conformance: ac-fail-one failing for demo-impl",
      description:
        "Criterion ac-fail-one (item it-one, spec demo 5.0.0) has no passing VerificationRecord for demo-impl as of 2026-06-13T00:00:00.000Z. Fixtures: fx-a, fx-b.",
      attribution: "felag-audit",
      at: "2026-06-13T00:00:00.000Z",
    },
    {
      specItemRef: "demo#it-two",
      criterionId: "ac-fail-two",
      title: "Conformance: ac-fail-two failing for demo-impl",
      description:
        "Criterion ac-fail-two (item it-two, spec demo 5.0.0) has no passing VerificationRecord for demo-impl as of 2026-06-13T00:00:00.000Z. Fixtures: (none).",
      attribution: "felag-audit",
      at: "2026-06-13T00:00:00.000Z",
    },
  ],
};

describe("renderAuditWidget", () => {
  const fragment: string = renderAuditWidget(auditResult);

  it("is a fragment opening with an sr-only h2", () => {
    expect(fragment.startsWith("<!doctype")).toBe(false);
    expect(fragment).toMatch(/^<div id="fw-audit-\d+"[^>]*>\s*<h2 class="sr-only">/);
  });

  it("shows every proposal's criterion id and groups by spec item", () => {
    for (const id of ["ac-fail-one", "ac-fail-two"]) expect(fragment).toContain(id);
    expect(fragment).toContain("demo#it-one");
    expect(fragment).toContain("demo#it-two");
  });

  it("pulls fixtures out of the proposal description", () => {
    expect(fragment).toContain("fx-a, fx-b");
    // a (none) fixture set renders no fixtures line, not the literal "(none)".
    expect(fragment).not.toContain("fixtures: (none)");
  });

  it("each item can be filed or claimed; the whole plan sends all", () => {
    expect(fragment).toContain("felag: send ac-fail-one to the work store");
    expect(fragment).toContain("felag: claim ac-fail-one");
    expect(fragment).toContain("felag: send all 2 audit proposals to the work store");
  });

  it("no proposals → a one-line success state", () => {
    const empty: string = renderAuditWidget({ report: cleanReport, proposals: [] });
    expect(empty).toContain("Nothing to do");
    expect(empty).not.toContain("send all");
  });

  it("has no leading-slash sendPrompt and no hardcoded text color", () => {
    expect(fragment).not.toContain("sendPrompt('/");
    expect(fragment).not.toMatch(/felag:\s*\//);
    expect(fragment).not.toMatch(/color\s*:\s*#/i);
  });
});

// A cold-review round (the model the /felag review skill builds by parsing
// scripts/cold-review.sh output): a round number, a verdict, and findings
// tagged critical/major/nit. Not a felag record shape — the review loop has its
// own vocabulary (MERGE | REWORK; CRITICAL/MAJOR/NIT), distinct from
// conformance status.
const reworkRound = {
  specName: "demo-spec",
  round: 3,
  verdict: "REWORK",
  findings: [
    { severity: "critical", text: "ac-crit's fixture passes a wrong impl.", ref: "ac-crit" },
    { severity: "major", text: "Item 4 MUST is unenforceable from the text alone." },
    { severity: "nit", text: "Typo in the governance preamble." },
  ],
};
const mergeRound = {
  specName: "demo-spec",
  round: 5,
  verdict: "MERGE",
  findings: [],
};

describe("renderReviewWidget", () => {
  const fragment: string = renderReviewWidget(reworkRound);

  it("is a fragment opening with an sr-only h2", () => {
    expect(fragment.startsWith("<!doctype")).toBe(false);
    expect(fragment).toMatch(/^<div id="fw-review-\d+"[^>]*>\s*<h2 class="sr-only">/);
  });

  it("shows the round number and the verdict", () => {
    expect(fragment).toContain("Round 3");
    expect(fragment).toContain("REWORK");
  });

  it("groups findings by severity with severity dots and a count strip", () => {
    expect(fragment).toContain("Critical");
    expect(fragment).toContain("Major");
    expect(fragment).toContain("Nit");
    // severity dots are inline background glyphs, never text color.
    expect(fragment).toMatch(/background:#[0-9A-Fa-f]{6}/);
  });

  it("contains every finding's text", () => {
    for (const f of reworkRound.findings) expect(fragment).toContain(f.text);
  });

  it("each finding folds into the spec (ref when present, text otherwise)", () => {
    expect(fragment).toContain("felag: fold ac-crit into the spec");
    expect(fragment).toContain(
      "felag: fold Item 4 MUST is unenforceable from the text alone. into the spec",
    );
  });

  it("a REWORK round offers re-review but not merge", () => {
    expect(fragment).toContain("felag: re-review demo-spec");
    expect(fragment).not.toContain("felag: merge demo-spec");
  });

  it("a clean MERGE is a one-line success state offering merge", () => {
    const merged: string = renderReviewWidget(mergeRound);
    expect(merged).toContain("MERGE");
    expect(merged).toContain("nothing left to fold");
    expect(merged).toContain("felag: merge demo-spec");
    expect(merged).not.toContain("Critical");
  });

  it("uses 0.5px borders, has no leading-slash sendPrompt, and no hardcoded text color", () => {
    expect(fragment).toContain("0.5px");
    expect(fragment).not.toContain("sendPrompt('/");
    expect(fragment).not.toMatch(/felag:\s*\//);
    expect(fragment).not.toMatch(/color\s*:\s*#/i);
  });
});

// A RenderInventory (the shape `felag render --audience` emits): a sorted set of
// included record ids + the fields projected out for that audience. The render
// widget is the only felag view keyed on an AUDIENCE, not conformance status.
// `spec` is the claude-layer convenience the skill sets so re-render intents name
// the spec — not part of the vendor-neutral inventory contract.
const stakeholderInv = {
  spec: "demo-spec",
  included: ["ac-one", "ac-two", "it-1", "it-2"],
  excludedFields: ["class", "fixtures", "judgment", "source"],
};
const verifierInv = {
  spec: "demo-spec",
  included: ["ac-one", "ac-two", "fx-1", "fx-2", "it-1", "it-2"],
  excludedFields: [],
};

describe("renderRenderWidget", () => {
  const fragment: string = renderRenderWidget(stakeholderInv, "stakeholder");

  it("is a fragment opening with an sr-only h2", () => {
    expect(fragment.startsWith("<!doctype")).toBe(false);
    expect(fragment).toMatch(/^<div id="fw-render-\d+"[^>]*>\s*<h2 class="sr-only">/);
  });

  it("shows the audience and offers a toggle to the other two", () => {
    expect(fragment).toContain("Stakeholder");
    expect(fragment).toContain("Developer");
    expect(fragment).toContain("Verifier");
    expect(fragment).toContain('aria-label="Audience"');
    // each audience is a fresh projection → the toggle re-renders via sendPrompt.
    expect(fragment).toContain("felag: render demo-spec for developer");
    expect(fragment).toContain("felag: render demo-spec for verifier");
  });

  it("lists every included record id", () => {
    for (const id of stakeholderInv.included) expect(fragment).toContain(id);
  });

  it("shows the excluded fields as hidden-from-this-audience chips", () => {
    for (const f of stakeholderInv.excludedFields) expect(fragment).toContain(f);
    expect(fragment).toContain("Hidden from this audience");
  });

  it("an empty excludedFields set is a one-line every-field-visible state", () => {
    const full: string = renderRenderWidget(verifierInv, "verifier");
    expect(full).toContain("Every field is visible");
    expect(full).not.toContain("Hidden from this audience");
    for (const id of verifierInv.included) expect(full).toContain(id);
  });

  it("falls back to \"the spec\" when the inventory carries no spec name", () => {
    const noName: string = renderRenderWidget(
      { included: ["it-1"], excludedFields: [] },
      "developer",
    );
    expect(noName).toContain("felag: render the spec for verifier");
  });

  it("uses 0.5px borders, has no leading-slash sendPrompt, and no hardcoded text color", () => {
    expect(fragment).toContain("0.5px");
    expect(fragment).not.toContain("sendPrompt('/");
    expect(fragment).not.toMatch(/felag:\s*\//);
    expect(fragment).not.toMatch(/color\s*:\s*#/i);
  });
});

// `felag lint` / felag_lint MCP result: {valid, errors:[{code,ref}],
// orphanFixtures:[ids]}. Lint is the merge gate; the widget is diagnostic.
const cleanLint = { valid: true, errors: [], orphanFixtures: [], spec: "felag-core" };
const errorLint = {
  valid: false,
  errors: [
    { code: "E_DUPLICATE_ID", ref: "ac-foo" },
    { code: "E_MISSING_FIXTURES", ref: "ac-bar" },
    { code: "E_MULTIPLE_OWNERS", ref: "preamble" },
  ],
  orphanFixtures: ["fx-stray", "fx-lonely"],
  spec: "demo-spec",
};

describe("renderLintWidget", () => {
  const fragment: string = renderLintWidget(errorLint, "demo-spec");

  it("is a fragment opening with an sr-only h2", () => {
    expect(fragment.startsWith("<!doctype")).toBe(false);
    expect(fragment).toMatch(/^<div id="fw-lint-\d+"[^>]*>\s*<h2 class="sr-only">/);
  });

  it("a clean result is a single green one-liner, not empty sections", () => {
    const clean: string = renderLintWidget(cleanLint, "felag-core");
    expect(clean).toContain("lints clean");
    expect(clean).toContain("ti-circle-check");
    expect(clean).not.toContain("Errors");
    expect(clean).not.toContain("Orphan fixtures");
    expect(clean).toContain("felag: re-lint felag-core");
  });

  it("a valid-but-orphaned result is NOT clean — orphans still show", () => {
    const orphaned: string = renderLintWidget(
      { valid: true, errors: [], orphanFixtures: ["fx-stray"] },
      "demo-spec",
    );
    expect(orphaned).not.toContain("lints clean");
    expect(orphaned).toContain("Orphan fixtures");
    expect(orphaned).toContain("fx-stray");
  });

  it("shows the count strip for errors and orphan warnings", () => {
    expect(fragment).toContain("Errors");
    expect(fragment).toContain("Orphan fixtures");
  });

  it("shows every error's code and ref", () => {
    for (const e of errorLint.errors) {
      expect(fragment).toContain(e.code);
      expect(fragment).toContain(e.ref);
    }
  });

  it("shows every orphan fixture id", () => {
    for (const id of errorLint.orphanFixtures) expect(fragment).toContain(id);
  });

  it("offers a re-lint action naming the spec", () => {
    expect(fragment).toContain("felag: re-lint demo-spec");
  });

  it("falls back to \"the spec\" when no spec name is given", () => {
    const noName: string = renderLintWidget({ valid: false, errors: [{ code: "E_SCHEMA", ref: "x" }], orphanFixtures: [] });
    expect(noName).toContain("felag: re-lint the spec");
  });

  it("uses 0.5px borders, has no leading-slash sendPrompt, and no hardcoded text color", () => {
    expect(fragment).toContain("0.5px");
    expect(fragment).not.toContain("sendPrompt('/");
    expect(fragment).not.toMatch(/felag:\s*\//);
    expect(fragment).not.toMatch(/color\s*:\s*#/i);
  });
});
