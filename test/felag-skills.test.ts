// The /felag skill widget layer is the Claude coupling (felag/skills/) and
// sits OUTSIDE the vendor-neutral src/ — but widget.mjs is a pure model→string
// function, so it's headless-testable without a browser or the show_widget
// tool. These are smoke tests over the rendered fragment's hard rules, not
// conformance (the widgets are presentation, an excluded surface).

import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM JS module, no .d.ts (Claude-coupling layer).
import { renderStatusWidget, renderReviewQueueWidget } from "../felag/skills/widget.mjs";

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
