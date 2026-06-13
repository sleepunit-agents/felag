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
