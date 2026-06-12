// felag/author output validators (spec/felag-core c-author, proposed at 1.0.0).
// author-output (A1-A3), excavate-output (X1-X3), render-inventory (R1-R3),
// prime-output. Each binds a verb's ARTIFACT — felag never runs the
// interview, the archaeology, or the typesetting.

import { lint } from "./lint.js";
import type {
  AuthorOutputInput,
  Criterion,
  ExcavateOutputInput,
  Fixture,
  Item,
  LintResult,
  PrimeOutputInput,
  RenderInventory,
  RenderInventoryInput,
  SpecRecord,
} from "./records.js";

const DEFAULT_CRITERIA_PER_ITEM = 7; // pinned in the wire format, not in any spec record

function sortErrors(errors: { code: string; ref: string }[]): LintResult {
  errors.sort((a, b) =>
    a.code !== b.code ? (a.code < b.code ? -1 : 1) : a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0,
  );
  return { valid: errors.length === 0, errors };
}

function criteria(spec: SpecRecord[]): Criterion[] {
  return spec.filter((r): r is Criterion => r.record === "criterion");
}

/**
 * A1 lint-valid; A2 scenario budgets; A3 provenance of newly-authored criteria.
 *
 * input.spec is the COMPLETE post-interview record set — fixture records
 * included, not just spec.jsonl's preamble/items/criteria. Criteria
 * referencing fixtures absent from input.spec fail A1 with
 * E_UNKNOWN_FIXTURE. (First trip hazard of the watchdog-core dogfood run.)
 */
export function validateAuthorOutput(input: AuthorOutputInput): LintResult {
  const errors = [...lint(input.spec).errors];
  const cap = input.budgets?.criteriaPerItem ?? DEFAULT_CRITERIA_PER_ITEM;

  const perItem = new Map<string, number>();
  for (const c of criteria(input.spec)) {
    perItem.set(c.itemId, (perItem.get(c.itemId) ?? 0) + 1);
  }
  for (const [itemId, count] of perItem) {
    if (count > cap) errors.push({ code: "E_BUDGET_CRITERIA", ref: itemId });
  }

  const byId = new Map(criteria(input.spec).map((c) => [c.id, c]));
  for (const id of input.new) {
    const c = byId.get(id);
    if (!c) errors.push({ code: "E_UNKNOWN_CRITERION", ref: id });
    else if (c.source !== "forethought") errors.push({ code: "E_BAD_PROVENANCE", ref: id });
  }
  return sortErrors(errors);
}

/** X1 scoping required; X2 discovered+proposed provenance; X3 in-scope lint-valid. */
export function validateExcavateOutput(input: ExcavateOutputInput): LintResult {
  const errors = [...lint(input.spec).errors];

  if (!input.scope || !Array.isArray(input.scope.contracts) || input.scope.contracts.length === 0) {
    errors.push({ code: "E_NO_SCOPE", ref: "scope" });
    return sortErrors(errors);
  }
  const scoped = new Set(input.scope.contracts);
  for (const c of criteria(input.spec)) {
    if (
      c.source !== "discovered" ||
      c.state !== "proposed" ||
      c.discoveredAt === undefined ||
      c.discoveredBy === undefined ||
      c.triggeringEvent === undefined
    ) {
      errors.push({ code: "E_BAD_PROVENANCE", ref: c.id });
    }
    if (c.contractId !== undefined && !scoped.has(c.contractId)) {
      errors.push({ code: "E_OUT_OF_SCOPE", ref: c.id });
    }
  }
  return sortErrors(errors);
}

/** R1-R3 audience projection: exact content-inventory sets, never typesetting. */
export function renderInventory(input: RenderInventoryInput): RenderInventory {
  const items = input.spec.filter((r): r is Item => r.record === "item");
  const crits = criteria(input.spec);
  const fixtures = input.spec.filter((r): r is Fixture => r.record === "fixture");
  // The preamble has no id and is included for every audience by definition.

  let included: string[];
  let excludedFields: string[];
  switch (input.audience) {
    case "stakeholder":
      included = [
        ...items.map((i) => i.id),
        ...crits.filter((c) => c.state !== "deprecated").map((c) => c.id),
      ];
      excludedFields = [
        "class",
        "contractId",
        "discoveredAt",
        "discoveredBy",
        "fixtures",
        "interfaceSketch",
        "itemId",
        "judgment",
        "source",
        "triggeringEvent",
        "type",
      ];
      break;
    case "developer":
      included = [
        ...items.map((i) => i.id),
        ...crits.filter((c) => c.state !== "deprecated").map((c) => c.id),
        ...fixtures.map((f) => f.id),
      ];
      excludedFields = [];
      break;
    case "verifier":
      included = [...items.map((i) => i.id), ...crits.map((c) => c.id), ...fixtures.map((f) => f.id)];
      excludedFields = [];
      break;
  }
  return { included: included.sort(), excludedFields };
}

/** Prime: protocol-item bodies present verbatim. A protocol item is an item
 * with at least one criterion whose contractId is c-author. */
export function validatePrimeOutput(input: PrimeOutputInput): LintResult {
  const protocolItemIds = new Set(
    criteria(input.spec)
      .filter((c) => c.contractId === "c-author")
      .map((c) => c.itemId),
  );
  const errors: { code: string; ref: string }[] = [];
  for (const r of input.spec) {
    if (r.record === "item" && protocolItemIds.has(r.id) && !input.output.includes(r.body)) {
      errors.push({ code: "E_MISSING_PROTOCOL", ref: r.id });
    }
  }
  return sortErrors(errors);
}
