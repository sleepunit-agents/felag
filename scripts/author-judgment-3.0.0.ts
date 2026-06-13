// Ceremony 3 (art-69e): author felag-core 3.0.0 — judgment-criterion gating.
// v2: cold-review round 1 folded — judgmentHash projection binding (was
// full-line criterionHash), cross-criterion poison semantics stated and
// fixtured, verify-input schema-validity of the poisoned fixture, window
// empty for early bases, kind-forbidden subclauses fixtured, code-point
// ordering pinned, disputed/poisoned/no-records/judges-order fixtures.
// Builds the amended spec.jsonl and fixtures.jsonl through the library
// (serialize/sortFixtures, hashes via recordHash/judgmentHash — never
// hand-formatted), validates with validateAuthorOutput and lint, writes
// canonical interchange. Rerunnable: reads the committed 2.0.0 files.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, serialize, sortFixtures, recordHash } from "../src/canonical.js";
import { judgmentHash } from "../src/graduation.js";
import { lint } from "../src/lint.js";
import { validateAuthorOutput } from "../src/author.js";
import type {
  Criterion,
  Fixture,
  Item,
  JudgmentRecord,
  Preamble,
  SpecRecord,
  Tolerance,
} from "../src/records.js";

const dir = join(import.meta.dirname, "..", "spec", "felag-core");
const spec = parse(readFileSync(join(dir, "spec.jsonl"), "utf8"));
const fixtures = parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8")) as Fixture[];

if ((spec[0] as Preamble).conformanceVersion !== "2.0.0") {
  throw new Error("expected the committed 2.0.0 spec as input — already amended?");
}

// ---------------------------------------------------------------------------
// 1. Preamble: version, c-verification description, exclusion swap.
// ---------------------------------------------------------------------------

const preamble = spec[0] as Preamble;
preamble.conformanceVersion = "3.0.0";

const cVer = preamble.contracts.find((c) => c.id === "c-verification")!;
cVer.description =
  "VerificationRecord submission and the conformance ledger: record validation and ingestion, gating, verdict derivation including waivers and the conforms-with-waivers token, and conformance reporting. Since 3.0.0: JudgmentRecord ingestion and the graduation function — judgment-criterion gating derived from recorded judge verdicts (calibration-corpus admissibility, reproducibility tolerance, derived provenance).";

const oldExclusion = preamble.exclusions.findIndex((e) => e.startsWith("Judgment-criterion gating:"));
if (oldExclusion === -1) throw new Error("judgment-gating exclusion not found");
preamble.exclusions.splice(
  oldExclusion,
  1,
  "Judge execution: felag never calls a judge model, hosts a rubric prompt, or schedules judge runs; judgment verdicts arrive as JudgmentRecords exactly as conformance checks arrive as VerificationRecords, and the independence of judge runs is attested by the records, not verified — the runner-integrity stance applied to judging. Target verdicts are calibrated attestation, not third-party-reproducible checks: only calibration records are publicly checkable against the anchor corpus (it-judgment states the asymmetry plainly). (The judgment-gating exclusion that stood from 1.0.0 was removed at 3.0.0: the graduation bar it required — reproducibility tolerance, calibration-corpus judge substitution, verdict provenance — is it-graduation.)",
);

// ---------------------------------------------------------------------------
// 2. Item body amendments.
// ---------------------------------------------------------------------------

function item(id: string): Item {
  const it = spec.find((r) => r.record === "item" && r.id === id) as Item | undefined;
  if (!it) throw new Error(`item ${id} not found`);
  return it;
}
function criterion(id: string): Criterion {
  const c = spec.find((r) => r.record === "criterion" && r.id === id) as Criterion | undefined;
  if (!c) throw new Error(`criterion ${id} not found`);
  return c;
}
function amend(target: { body?: string; gherkin?: string; item?: string }, field: "body" | "gherkin" | "item", from: string, to: string) {
  const text = target[field];
  if (text === undefined || !text.includes(from)) throw new Error(`amendment anchor not found: ${from.slice(0, 60)}`);
  target[field] = text.replace(from, to);
}

// it-gating — the gating definition extends; judgment-without-object stays
// advisory; graduated satisfaction and the no-new-token decision.
item("it-gating").body =
  "A criterion gates conformance only if all hold: force MUST, contractId set to a contract declared in the preamble, state active or disputed - a disputed criterion continues to gate every implementer except the disputer - and either class behavioral, or class judgment carrying a judgment object: a graduatable criterion (it-graduation). (Derived resolution: design v1.1 lists 'state: active' in the gating conjunction while also requiring disputed criteria to keep gating non-disputers; this spec resolves the contradiction by admitting both states and excluding the disputer.) Gate is a subset of the allowlist: a criterion about an undeclared surface cannot gate no matter how it is written.\n\nStates: proposed (exists in committed interchange, never gates; excavate's output state), active, deprecated (retired from gating, kept for history), disputed (gates everyone except the disputing implementer; reported loudly everywhere). A disputed criterion carries dispute: {by, reason, at} - 'by' is the implementer roster name whose reports stop gating on it (derived: the design names no schema home for dispute attribution).\n\nJudgment-class criteria without a judgment object are advisory by construction - they appear in reports, never in the verdict, exactly as at 0.2.0. The judgment object is graduation intent: adding one to an active criterion changes every implementer's obligations (ac-vers-major's 'graduates a judgment criterion to gating' clause - MAJOR, a deliberate act, never an edit that slips through). A gating judgment criterion is satisfied iff the graduation function returns graduated for it over the verify input's judgmentRecords (D1J, it-graduation); unsatisfied it is waivable (D2) and otherwise drifts, exactly as a behavioral criterion with no passing record - gating that can be dodged by not submitting evidence is not gating. There is no judgment-specific verdict token: waivers already express sanctioned incompleteness, loudly, and a fourth token would weaken every existing report consumer. State transitions never re-judge: ratification and dispute change who gates, not what was judged - judgment evidence survives them by construction (the judgmentHash projection, it-judgment).";

// ac-vers-major — the surface it classifies grew: a gating judgment
// criterion's rubric or tolerance is normative text (the rubric stales all
// evidence via the projection; tolerance changes the gate's arithmetic).
amend(
  criterion("ac-vers-major"),
  "item",
  "or materially changes normative text (the gherkin or item of an active MUST criterion, or algorithm/rule text carried in an item body)",
  "or materially changes normative text (the gherkin or item of an active MUST criterion, an active MUST judgment criterion's rubric or tolerance, or algorithm/rule text carried in an item body)",
);

// ac-gate-filter — active-text amendment (MAJOR): scope to non-graduatable.
amend(
  criterion("ac-gate-filter"),
  "gherkin",
  "a judgment MUST criterion under the same contract with a failing record",
  "a judgment MUST criterion without a judgment object under the same contract with a failing record",
);

// it-fixtures — judgment criteria with graduation intent now require fixtures.
amend(
  item("it-fixtures"),
  "body",
  "Any behavioral criterion with a contractId MUST reference at least one fixture (lint: E_MISSING_FIXTURES); judgment criteria are exempt and never gate.",
  "Any behavioral criterion with a contractId MUST reference at least one fixture (lint: E_MISSING_FIXTURES); so MUST any judgment criterion carrying a judgment object - its fixtures are its calibration corpus (it-graduation). Judgment criteria without a judgment object are exempt and never gate.",
);

// it-lint — the two 3.0.0 codes.
amend(
  item("it-lint"),
  "body",
  "and the roster checks E_DUPLICATE_IMPLEMENTER (two roster entries share a name; ref is the duplicated name) and E_MULTIPLE_OWNERS (more than one roster entry carries the repo-owner role; ref is 'preamble') - roster-reference resolution and the promotion tiebreak both presuppose them.",
  "and the roster checks E_DUPLICATE_IMPLEMENTER (two roster entries share a name; ref is the duplicated name) and E_MULTIPLE_OWNERS (more than one roster entry carries the repo-owner role; ref is 'preamble') - roster-reference resolution and the promotion tiebreak both presuppose them. At 3.0.0: E_BAD_TOLERANCE - a judgment object's tolerance violating 2 x agreement > runs, or carrying agreement > runs, naming the criterion (the first would let reproducible-pass and reproducible-fail hold at once; the second is unreachable - a window of runs records can never carry more than runs agreeing verdicts; the schema constrains runs and agreement to integers >= 1, lint enforces both cross-field rules). E_MISSING_FIXTURES extends to graduation intent: a judgment criterion carrying a judgment object with an empty fixtures list is invalid - its fixtures are its calibration corpus (it-graduation), and a graduation bar with no anchors is bare assertion wearing a rubric.",
);

// it-verification — fixture-exchange input gains judgmentRecords; D1J; D4;
// D1 scoped to behavioral (D1J specializes judgment).
amend(
  item("it-verification"),
  "body",
  "D1. A gating criterion (see it-gating) is satisfied if",
  "D1. A gating behavioral criterion (see it-gating) is satisfied if",
);
amend(
  item("it-verification"),
  "body",
  "For fixture exchange this input is one JSON object {asOf, implementation, records, spec, waivers} where spec is the concatenated parsed records of spec.jsonl and fixtures.jsonl.",
  "For fixture exchange this input is one JSON object {asOf, implementation, judgmentRecords, records, spec, waivers} where spec is the concatenated parsed records of spec.jsonl and fixtures.jsonl, and judgmentRecords (optional since 3.0.0, absent meaning empty) is the JudgmentRecord evidence for graduatable judgment criteria (it-judgment, it-graduation).",
);
amend(
  item("it-verification"),
  "body",
  "\nD2. An unsatisfied gating criterion",
  "\nD1J (3.0.0). A gating judgment criterion (it-gating: graduatable, state active or disputed) is satisfied iff graduate({criterionId, implementation, records: the input's FULL judgmentRecords array, spec}) returns graduated (it-graduation). verify never pre-validates judgmentRecords against the wire schema - verify is total with no error channel, its preconditions are the caller's, exactly as for D1's records; the fail-closed path is graduate's G1, which validates the full array for every graduation: a record ingestJudgment rejects - whatever criterion it names - fails every gating judgment criterion in the spec, criteria whose own records are pristine included. Records rejected by ingestJudgment never reach a ledger; an input carrying one is corrupt evidence, loud everywhere, never filtered quietly. D2 and D3 apply to judgment criteria unchanged.\nD2. An unsatisfied gating criterion",
);
amend(
  item("it-verification"),
  "body",
  "and an advisory listing of judgment criteria that have records, with their latest verdicts.",
  "and an advisory listing of NON-GRADUATABLE judgment criteria - those without a judgment object - that have records, with their latest verdicts; advisory verdicts are VerificationRecord-borne self-reports. Graduatable judgment criteria never appear in advisory: when they gate they appear in failing or waived like every other gating criterion, and when they do not gate (proposed or deprecated state, or disputed for the disputer) their judgment evidence does not bear on this report at all - the graduation result is its own diagnostic surface.",
);

// it-classes — the verifier class surface grows.
amend(
  item("it-classes"),
  "body",
  "felag/verifier covers verify and audit and validates VerificationRecord ingestion, waivers, reports, and coverage - its gating surface is contract c-verification.",
  "felag/verifier covers verify, audit, and (3.0.0) graduate, and validates VerificationRecord and JudgmentRecord ingestion, the graduation function, waivers, reports, and coverage - its gating surface is contract c-verification.",
);

// ---------------------------------------------------------------------------
// 3. New items + criteria (proposed; ratification is the promotion protocol's).
// ---------------------------------------------------------------------------

const itJudgment: Item = {
  record: "item",
  id: "it-judgment",
  title: "Judgment records",
  body: "Judgment verification applies the verify stance to judgment: felag never runs the judge - judges run outside the boundary, by whatever harness the implementation chooses, and their verdicts arrive as JudgmentRecords exactly as conformance checks arrive as VerificationRecords. A JudgmentRecord is {criterionId, judgmentHash, kind: calibration|target, fixtureId?, fixtureHash?, implementation?, conformanceVersion?, judge, verdict: pass|fail|unverifiable, evidence, runner, at, attribution}. One asymmetry stated plainly: a target verdict is attested evidence, weaker than a behavioral VerificationRecord. A behavioral record's check is reproducibility against the public fixture corpus - anyone can re-run the fixture and check the verdict. A target JudgmentRecord judges conduct that is in no corpus: only the judge's calibration is third-party-checkable; the target verdict is reproducible only by whoever can observe the conduct. Judgment gating is therefore calibrated attestation, and ratifying graduation intent accepts that bar - the runner-integrity trust model, applied to a sparser evidence stream.\n\njudgmentHash - required on BOTH kinds - binds a record to the judgment projection: 'sha256:' followed by the lowercase hex SHA-256 of the UTF-8 bytes of the canonical serialization (CS2, CS4, CS5) of the object {criterionId, rubric, text}, where criterionId is the criterion's id, rubric is its judgment.rubric, and text is its gherkin if type scenario, else its item. The projection is exactly what the judge was shown to judge against: the obligation text and the rubric. A record whose judgmentHash differs from the criterion's current projection hash is stale and ignored by graduation - amending the rubric or the criterion text resets the evidence loudly, never silently (the staleness mechanic of fixtureHash and the promotion ack's criterionHash, reused). Deliberately NOT in the projection: state and dispute (ratifying graduation intent must not void the evidence that justified ratifying it, and a third party's dispute must not stale a non-disputer's records - governance transitions change who gates, not what was judged), tolerance (an aggregation parameter re-evaluated on every graduation, not something the judge saw), fixtures (anchors bind per-anchor through fixtureHash, and admissibility is recomputed against the current corpus on every graduation), and the provenance fields. This is deliberately narrower than the promotion ack's criterionHash, which binds the full canonical line: an ack endorses the whole record once; judgment evidence accumulates across governance transitions.\n\nkind calibration requires fixtureId and fixtureHash and forbids implementation and conformanceVersion: calibration is a property of the judge, not of anyone's conduct. kind target requires implementation and conformanceVersion and forbids fixtureId and fixtureHash: the judge was shown the implementation's actual conduct, not an anchor. fixtureHash is required on calibration records - stricter than VerificationRecord, where it is optional - because a calibration record's entire meaning is 'this judge reproduces the known verdict on exactly this anchor'; an unbound calibration is meaningless, and an edited anchor must recalibrate every judge, fail closed.\n\njudge is {model}: structured matching plumbing, NOT attribution - the second kind of name in it-governance's two-kinds-of-names doctrine. Judge identity is the canonical serialization (CS2, CS4, CS5) of the judge object, compared for byte equality only: the graduation function groups records by it and builds no other behavior on its value - never parsed, never ranked, no version arithmetic. Publishers encode model, version, and configuration in the model string; felag compares bytes. ac-ver-attribution-opaque continues to govern the free-form attribution field, which judgment records also carry. A pinned judge-configuration field was deliberately rejected: a spec that names admissible judges hard-depends on models (vendor-neutrality applied to judging itself) and dies with every deprecation; the calibration corpus replaces it - any judge that reproduces the known verdicts is admissible (it-graduation).\n\ningestJudgment reuses the ingest result format {accepted, errors:[code]} and its codes: E_MISSING_FIELD (a field required for the record's kind is absent), E_SCHEMA (wrong types, kind-forbidden fields present, a judgmentHash or fixtureHash that is not 'sha256:' plus 64 lowercase hex, a malformed judge object, an at that does not parse per it-verification's instants rule - the schema's date-time format is annotation, not assertion; parseability is this prose rule, fixture-pinned), E_BAD_VERDICT (verdict outside pass|fail|unverifiable); errors sorted ascending.",
};

const acJudIngest: Criterion = {
  record: "criterion",
  id: "ac-jud-ingest",
  itemId: "it-judgment",
  contractId: "c-verification",
  type: "scenario",
  class: "behavioral",
  force: "MUST",
  state: "proposed",
  source: "forethought",
  gherkin:
    "Given JudgmentRecords of kind calibration and kind target carrying all kind-required fields\nWhen ingestJudgment validates each, both are accepted\nAnd a record missing judgmentHash, with a verdict outside pass|fail|unverifiable and a judge object carrying keys beyond model, is rejected naming all three defects\nAnd a calibration record carrying implementation or conformanceVersion, or a target record carrying fixtureId or fixtureHash, is rejected with E_SCHEMA alongside E_MISSING_FIELD for its absent kind-required fields\nAnd a judgmentHash that is not sha256: plus 64 lowercase hex is rejected with E_SCHEMA\nAnd the projection draws its text from the gherkin of a scenario criterion, never its absent item",
  fixtures: [
    "fx-grad-scenario-projection",
    "fx-jud-ingest-bad-hash",
    "fx-jud-ingest-calibration",
    "fx-jud-ingest-invalid",
    "fx-jud-ingest-kind",
    "fx-jud-ingest-kind-target",
    "fx-jud-ingest-target",
  ],
};

const itGraduation: Item = {
  record: "item",
  id: "it-graduation",
  title: "The graduation function",
  body: 'Graduation is how a judgment criterion becomes gateable without felag ever judging: a total, deterministic, fixturable function of exactly (criterionId, implementation, records, spec) - the shape of promote and verify. The non-determinism (the judge model call) lives entirely in record production, outside the boundary; fixtures prove the function with synthetic judgment records, no live judge required.\n\nA criterion is graduatable iff it carries a judgment object {rubric, tolerance?} with tolerance {runs, agreement} defaulting to {runs: 3, agreement: 3} - the default is pinned in this wire format, not in any spec record (the criteriaPerItem pattern). Unanimity-of-3 as the default is deliberate: disagreement at n=3 means the rubric is ambiguous, and an ambiguous rubric should not gate; authors relax it deliberately. Lint enforces 2 x agreement > runs (E_BAD_TOLERANCE), so reproducible-pass and reproducible-fail are mutually exclusive by construction. A graduatable criterion\'s fixtures list IS its calibration corpus: anchor fixtures, format felag/judgment-anchor@0, input the artifact to judge (payload-opaque, whatever the rubric needs), expected exactly {"verdict":"pass"} or {"verdict":"fail"} - one key, those values. Anchor adequacy lives here, not in lint: lint never reads payloads (an interchange invariant), while interpreting payloads per format is what payload-consuming functions are for. An anchor\'s format string is conventional documentation, not consulted by adequacy - the expected shape is the test. Anchor quality - are the anchors discriminating? - is the spec author\'s judgment conduct, ac-author-conduct\'s jurisdiction, the same place rubric quality lives.\n\nWire formats felag/graduation-input@0 {criterionId, implementation, records, spec} and felag/graduation-result@0 {graduated, errors, basis, judges, window} (see schema). Guards, mirroring promotion - each returns the full result with the single guard code, basis null, judges and window empty, and stops: G1 the input fails the wire-format schema, every record acceptable to ingestJudgment and timestamps parseable per it-verification\'s instants rule (E_SCHEMA); G2 spec fails lint (E_SPEC_INVALID); G3 criterionId names no criterion record (E_UNKNOWN_CRITERION); G4 the named criterion carries no judgment object (E_NOT_GRADUATABLE).\n\nDefinitions. Judge identity: the canonical serialization (CS2, CS4, CS5) of a record\'s judge object; equality is byte equality. Adequate corpus: the criterion\'s fixtures list is non-empty, every referenced anchor\'s expected parses as exactly {"verdict":"pass"} or {"verdict":"fail"}, and at least one anchor expects pass and at least one expects fail. The fail anchor is load-bearing: it is what kills the lazy always-pass judge, and it is why the agreement statistic needs no chance correction (a chance-corrected coefficient was rejected: floating-point statistics break fixture byte-equality across languages, and kappa is undefined at exactly the perfect agreement the protocol rewards). Admissible judge: judge J is admissible for criterion C iff C\'s corpus is adequate and for EVERY anchor in C.fixtures, the latest calibration record by J for (C.id, anchor id) whose judgmentHash equals C\'s current projection hash (it-judgment) and whose fixtureHash equals the anchor\'s current canonical hash - instant order on at, equal instants tying to the greatest array index, D1\'s rule verbatim - exists and has verdict equal to the anchor\'s expected verdict. The bar is all anchors, exactly: the corpus is author-curated to be unambiguous, and a judge wrong on an unambiguous anchor is inadmissible (a pass-rate knob, if real corpora ever need one, is a MINOR addition). Qualifying record: a target record matching criterionId = C.id, the input\'s implementation, and conformanceVersion equal to the spec preamble\'s, whose judgmentHash equals C\'s current projection hash, whose at parses, and whose judge is admissible. Window: the latest tolerance.runs qualifying records by instant, equal instants tying to the greatest array index. Independence of runs is attested, not verified: records are self-reported, and their check is calibration against the public anchor corpus, not identity - the runner-integrity stance; a distinctJudges floor is deliberately deferred (MINOR-addable, tightening only criteria that opt in).\n\nDerivation, basis precedence (first that holds): corpus-inadequate; no-admissible-judge (adequate corpus, zero admissible judges among the input\'s records for C - an input with no records at all included); insufficient-evidence (fewer than tolerance.runs qualifying records); then over the full window, counting passes p and fails f - unverifiable occupies its slot and counts toward neither (an abstention is evidence of non-reproducibility; fail closed, the malformed-waiver stance): satisfied iff p >= agreement, reproducible-fail iff f >= agreement (the judges agree the conduct violates - a conduct problem), else unreproducible (the judges split - a rubric problem; the basis names the remedy). graduated is true iff basis is satisfied.\n\nProvenance is derived and loud, never carried: the result\'s judges lists every distinct judge identity appearing in the input\'s records for C - calibration or target - as {admissible, judge}, sorted ascending by the Unicode code points of the judge identity\'s canonical serialization (CS4\'s order, never UTF-16 code-unit order); window lists the selected target records as {at, judge, verdict} in selection order (instant ascending, ties by array index), each at exactly as carried on the record, never normalized. The result\'s window is empty for every basis except satisfied, reproducible-fail, and unreproducible - the early bases select no window even when some records qualify. Records carry only binding-shaped provenance (judge identity, judgmentHash, fixtureHash); reproducibility stats and calibration evidence are recomputed from the ledger every time, the same reason promote recomputes effective decisions rather than trusting a tally field.\n\nGraduation is state-independent: it evaluates a proposed criterion identically to an active one - you test graduation before ratifying graduation intent, and the evidence survives ratification (the projection excludes state; it-judgment). Whether the result gates anyone is it-gating\'s business; whether to ratify the intent is the promotion protocol\'s.',
};

const acGradGuards: Criterion = {
  record: "criterion",
  id: "ac-grad-guards",
  itemId: "it-graduation",
  contractId: "c-verification",
  type: "scenario",
  class: "behavioral",
  force: "MUST",
  state: "proposed",
  source: "forethought",
  gherkin:
    "Given a graduation input missing a required field or carrying a record ingestJudgment rejects, the result is E_SCHEMA alone\nAnd given a spec that fails lint, the result is E_SPEC_INVALID alone\nAnd given a criterionId naming no criterion, the result is E_UNKNOWN_CRITERION alone\nAnd given a criterion without a judgment object, the result is E_NOT_GRADUATABLE alone\nAnd a proposed criterion graduates identically to an active one - graduation is state-independent",
  fixtures: [
    "fx-grad-not-graduatable",
    "fx-grad-proposed",
    "fx-grad-schema-guard",
    "fx-grad-schema-record",
    "fx-grad-spec-invalid",
    "fx-grad-unknown-criterion",
  ],
};

const acGradAdmissibility: Criterion = {
  record: "criterion",
  id: "ac-grad-admissibility",
  itemId: "it-graduation",
  contractId: "c-verification",
  type: "scenario",
  class: "behavioral",
  force: "MUST",
  state: "proposed",
  source: "forethought",
  gherkin:
    "Given a judgment criterion whose corpus carries pass and fail anchors\nWhen a judge's latest calibration records bound to the current projection and anchor hashes match every anchor's expected verdict, the judge is admissible - a later correct calibration supersedes an earlier wrong one\nAnd when a judge fails any anchor or its only calibration is stale against the current hashes, the judge is inadmissible and its target records never qualify\nAnd when the corpus lacks a pass or fail anchor or any expected does not parse as a verdict, the basis is corpus-inadequate for every judge\nAnd with an adequate corpus and zero admissible judges among the input's records - an input with no records at all included - the basis is no-admissible-judge\nAnd the result's judges list orders identities ascending by the Unicode code points of their canonical serialization",
  fixtures: [
    "fx-grad-calibration-latest",
    "fx-grad-corpus-inadequate",
    "fx-grad-corpus-extra-key",
    "fx-grad-corpus-no-pass",
    "fx-grad-corpus-unusable",
    "fx-grad-judges-order",
    "fx-grad-mixed-judges",
    "fx-grad-no-records",
    "fx-grad-stale-calibration",
    "fx-grad-stale-calibration-rubric",
    "fx-grad-uncalibrated",
  ],
};

const acGradWindow: Criterion = {
  record: "criterion",
  id: "ac-grad-window",
  itemId: "it-graduation",
  contractId: "c-verification",
  type: "scenario",
  class: "behavioral",
  force: "MUST",
  state: "proposed",
  source: "forethought",
  gherkin:
    "Given qualifying target records from admissible judges\nWhen the window is selected, it is the latest tolerance.runs records by instant after UTC normalization - a lexically greater but instant-earlier at never wins, equal instants tie to the greatest array index - and records with a stale judgmentHash, a conformanceVersion differing from the preamble's, or another implementation's name never enter\nAnd when fewer than tolerance.runs records qualify, the basis is insufficient-evidence and the result's window is empty",
  fixtures: [
    "fx-grad-foreign-implementation",
    "fx-grad-instant-order",
    "fx-grad-stale-criterion",
    "fx-grad-tie-index",
    "fx-grad-version-mismatch",
    "fx-grad-window-latest",
  ],
};

const acGradBasis: Criterion = {
  record: "criterion",
  id: "ac-grad-basis",
  itemId: "it-graduation",
  contractId: "c-verification",
  type: "scenario",
  class: "behavioral",
  force: "MUST",
  state: "proposed",
  source: "forethought",
  gherkin:
    "Given a full window of verdicts from admissible judges\nWhen passes reach agreement, the basis is satisfied and graduated is true\nAnd when fails reach agreement, the basis is reproducible-fail\nAnd when neither side reaches agreement - unverifiable verdicts occupying their slots and counting toward neither - the basis is unreproducible\nAnd when the criterion's judgment object omits tolerance, the pinned default runs 3 agreement 3 applies",
  fixtures: [
    "fx-grad-default-tolerance",
    "fx-grad-reproducible-fail",
    "fx-grad-satisfied",
    "fx-grad-unreproducible",
    "fx-grad-unverifiable-slot",
  ],
};

const acGateGraduated: Criterion = {
  record: "criterion",
  id: "ac-gate-graduated",
  itemId: "it-gating",
  contractId: "c-verification",
  type: "scenario",
  class: "behavioral",
  force: "MUST",
  state: "proposed",
  source: "forethought",
  gherkin:
    "Given a spec with an active MUST judgment criterion carrying a judgment object and an adequate calibration corpus\nWhen the implementation's judgment records graduate it, the verdict is conforms\nAnd when they do not - insufficient evidence included - the criterion fails and the verdict is drifts, with an unexpired waiver yielding conforms-with-waivers and never bare conforms\nAnd non-graduatable judgment criteria with records appear in the advisory listing - graduatable criteria, gating or not, never do\nAnd a judgment record rejected by ingestJudgment anywhere in the verify input fails every graduation at G1 - criteria whose own records are pristine included, fail closed\nAnd a disputed graduatable criterion gates everyone except the disputer, the dispute listed loudly, and the dispute itself stales no evidence",
  fixtures: [
    "fx-verdict-graduated-conforms",
    "fx-verdict-graduated-disputed-disputer",
    "fx-verdict-graduated-disputed-evidence",
    "fx-verdict-graduated-disputed-other",
    "fx-verdict-graduated-drifts",
    "fx-verdict-graduated-insufficient",
    "fx-verdict-graduated-waived",
    "fx-verdict-judgment-poisoned",
    "fx-verdict-judgment-poisoned-cross",
  ],
};

const acLintTolerance: Criterion = {
  record: "criterion",
  id: "ac-lint-tolerance",
  itemId: "it-lint",
  contractId: "c-interchange",
  type: "scenario",
  class: "behavioral",
  force: "MUST",
  state: "proposed",
  source: "forethought",
  gherkin:
    "Given a criterion whose judgment object carries tolerance with 2 x agreement <= runs, or with agreement > runs\nWhen lint runs\nThen the spec is rejected with E_BAD_TOLERANCE naming the criterion",
  fixtures: ["fx-lint-bad-tolerance", "fx-lint-tolerance-unreachable"],
};

const acLintJudgmentFixtures: Criterion = {
  record: "criterion",
  id: "ac-lint-judgment-fixtures",
  itemId: "it-lint",
  contractId: "c-interchange",
  type: "scenario",
  class: "behavioral",
  force: "MUST",
  state: "proposed",
  source: "forethought",
  gherkin:
    "Given a judgment criterion carrying a judgment object and an empty fixtures list\nWhen lint runs\nThen the spec is rejected with E_MISSING_FIXTURES naming the criterion",
  fixtures: ["fx-lint-judgment-missing-fixtures"],
};

// Splice: it-judgment + it-graduation after it-verification's cluster (CS7);
// ac-gate-graduated at the end of it-gating's cluster; lint criteria at the
// end of it-lint's cluster.
function lastIndexOfCluster(itemId: string): number {
  let last = -1;
  spec.forEach((r, i) => {
    if ((r.record === "item" && r.id === itemId) || (r.record === "criterion" && (r as Criterion).itemId === itemId)) {
      last = i;
    }
  });
  if (last === -1) throw new Error(`cluster ${itemId} not found`);
  return last;
}

spec.splice(lastIndexOfCluster("it-verification") + 1, 0, itJudgment, acJudIngest, itGraduation, acGradGuards, acGradAdmissibility, acGradWindow, acGradBasis);
spec.splice(lastIndexOfCluster("it-gating") + 1, 0, acGateGraduated);
spec.splice(lastIndexOfCluster("it-lint") + 1, 0, acLintTolerance, acLintJudgmentFixtures);

// ---------------------------------------------------------------------------
// 4. Fixtures. Hashes computed, never hand-written.
// ---------------------------------------------------------------------------

// The shared graduation playground: one contract, one item, one graduatable
// judgment criterion, a pass anchor and a fail anchor.
const gPreamble: Preamble = {
  record: "preamble",
  name: "g-spec",
  conformanceVersion: "1.0.0",
  goals: [],
  contracts: [{ id: "c-x", description: "playground contract" }],
  exclusions: [],
  implementers: [{ name: "impl-a", roles: ["author"] }],
};
const gItem: Item = { record: "item", id: "it-x", title: "Reporting", body: "Conduct under judgment." };

const anchorPass: Fixture = {
  record: "fixture",
  id: "anchor-pass",
  description: "Anchor: a clearly satisfying artifact (known-correct verdict pass)",
  format: "felag/judgment-anchor@0",
  input: { artifact: "The report names each failing criterion and states the remedy plainly." },
  expected: { verdict: "pass" },
};
const anchorFail: Fixture = {
  record: "fixture",
  id: "anchor-fail",
  description: "Anchor: a clearly violating artifact (known-correct verdict fail)",
  format: "felag/judgment-anchor@0",
  input: { artifact: "ERR 0x5f3759df see trace" },
  expected: { verdict: "fail" },
};
const anchorPass2: Fixture = {
  record: "fixture",
  id: "anchor-pass2",
  description: "Anchor: a second clearly satisfying artifact",
  format: "felag/judgment-anchor@0",
  input: { artifact: "Each waived criterion is listed with its expiry." },
  expected: { verdict: "pass" },
};
const anchorOdd: Fixture = {
  record: "fixture",
  id: "anchor-odd",
  description: "Anchor whose expected does not parse as a verdict",
  format: "felag/judgment-anchor@0",
  input: { artifact: "Ambiguous artifact." },
  expected: { verdict: "maybe" },
};
const anchorExtra: Fixture = {
  record: "fixture",
  id: "anchor-extra",
  description: "Anchor whose expected carries a key beyond verdict",
  format: "felag/judgment-anchor@0",
  input: { artifact: "Artifact with an over-specified expectation." },
  expected: { verdict: "pass", note: "exactly one key means exactly one" },
};
const anchorFail2: Fixture = {
  record: "fixture",
  id: "anchor-fail2",
  description: "Anchor: a second clearly violating artifact",
  format: "felag/judgment-anchor@0",
  input: { artifact: "see above lol" },
  expected: { verdict: "fail" },
};

function gCriterion(tolerance: Tolerance | undefined, over: Partial<Criterion> = {}): Criterion {
  return {
    record: "criterion",
    id: "jc-1",
    itemId: "it-x",
    contractId: "c-x",
    type: "checklist",
    class: "judgment",
    item: "While reporting conformance, the implementation shall use clear, observable language.",
    force: "MUST",
    state: "active",
    source: "forethought",
    fixtures: ["anchor-fail", "anchor-pass"],
    judgment: {
      rubric: "Is the report language clear, observable, and free of implementation jargon?",
      ...(tolerance ? { tolerance } : {}),
    },
    ...over,
  };
}

function gSpec(c: Criterion, anchors: Fixture[] = [anchorFail, anchorPass]): SpecRecord[] {
  return [gPreamble, gItem, c, ...anchors];
}

function cal(
  c: Criterion,
  anchor: Fixture,
  model: string,
  verdict: string,
  at: string,
  over: Partial<JudgmentRecord> = {},
): JudgmentRecord {
  return {
    criterionId: c.id,
    judgmentHash: judgmentHash(c),
    kind: "calibration",
    fixtureId: anchor.id,
    fixtureHash: recordHash(anchor),
    judge: { model },
    verdict: verdict as JudgmentRecord["verdict"],
    evidence: "calibration run",
    runner: "harness",
    at,
    attribution: "fixture",
    ...over,
  };
}
function tgt(c: Criterion, model: string, verdict: string, at: string, over: Partial<JudgmentRecord> = {}): JudgmentRecord {
  return {
    criterionId: c.id,
    judgmentHash: judgmentHash(c),
    kind: "target",
    implementation: "impl-a",
    conformanceVersion: "1.0.0",
    judge: { model },
    verdict: verdict as JudgmentRecord["verdict"],
    evidence: "target run",
    runner: "harness",
    at,
    attribution: "fixture",
    ...over,
  };
}
/** A judge fully calibrated on the pass+fail corpus. */
function calOk(c: Criterion, model: string): JudgmentRecord[] {
  return [cal(c, anchorFail, model, "fail", "2026-05-01T00:00:00Z"), cal(c, anchorPass, model, "pass", "2026-05-01T00:01:00Z")];
}

function gInput(c: Criterion, records: JudgmentRecord[], spec: SpecRecord[] = gSpec(c)) {
  return { criterionId: c.id, implementation: "impl-a", records, spec };
}
type WindowEntry = { at: string; judge: { model: string }; verdict: string };
function gResult(
  basis: string | null,
  judges: { admissible: boolean; judge: { model: string } }[],
  window: WindowEntry[],
  errors: string[] = [],
) {
  return { graduated: basis === "satisfied", errors, basis, judges, window };
}
const J = (model: string, admissible: boolean) => ({ admissible, judge: { model } });
const W = (at: string, model: string, verdict: string): WindowEntry => ({ at, judge: { model }, verdict });

const T3: Tolerance = { runs: 3, agreement: 3 };
const T2: Tolerance = { runs: 2, agreement: 2 };
const T1: Tolerance = { runs: 1, agreement: 1 };

const newFixtures: Fixture[] = [];
function fx(id: string, description: string, format: string, input: unknown, expected: unknown, contractId = "c-verification") {
  newFixtures.push({ record: "fixture", id, contractId, description, format, input, expected });
}

// --- graduation: basis (ac-grad-basis) ---
{
  const c = gCriterion(T3);
  fx(
    "fx-grad-satisfied",
    "Calibrated judge, three passing target runs at tolerance 3/3: basis satisfied, graduated true, provenance derived (judge admissible, window in instant order).",
    "felag/graduation-input@0",
    gInput(c, [...calOk(c, "judge-a"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z")]),
    gResult("satisfied", [J("judge-a", true)], [W("2026-06-01T00:00:00Z", "judge-a", "pass"), W("2026-06-02T00:00:00Z", "judge-a", "pass"), W("2026-06-03T00:00:00Z", "judge-a", "pass")]),
  );
}
{
  const c = gCriterion(T3);
  fx(
    "fx-grad-reproducible-fail",
    "Three failing target runs at 3/3: the judges agree the conduct violates - basis reproducible-fail, a conduct problem, not graduated.",
    "felag/graduation-input@0",
    gInput(c, [...calOk(c, "judge-a"), tgt(c, "judge-a", "fail", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "fail", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "fail", "2026-06-03T00:00:00Z")]),
    gResult("reproducible-fail", [J("judge-a", true)], [W("2026-06-01T00:00:00Z", "judge-a", "fail"), W("2026-06-02T00:00:00Z", "judge-a", "fail"), W("2026-06-03T00:00:00Z", "judge-a", "fail")]),
  );
}
{
  const c = gCriterion(T3);
  fx(
    "fx-grad-unreproducible",
    "Two passes and a fail at 3/3: neither side reaches agreement - basis unreproducible, a rubric problem.",
    "felag/graduation-input@0",
    gInput(c, [...calOk(c, "judge-a"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "fail", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z")]),
    gResult("unreproducible", [J("judge-a", true)], [W("2026-06-01T00:00:00Z", "judge-a", "pass"), W("2026-06-02T00:00:00Z", "judge-a", "fail"), W("2026-06-03T00:00:00Z", "judge-a", "pass")]),
  );
}
{
  const c = gCriterion(T3);
  fx(
    "fx-grad-unverifiable-slot",
    "Latest three are pass, pass, unverifiable at 3/3: the abstention occupies its window slot and counts toward neither side - unreproducible. An implementation that skips unverifiable records would pull in the older fourth pass and wrongly graduate.",
    "felag/graduation-input@0",
    gInput(c, [...calOk(c, "judge-a"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z"), tgt(c, "judge-a", "unverifiable", "2026-06-04T00:00:00Z")]),
    gResult("unreproducible", [J("judge-a", true)], [W("2026-06-02T00:00:00Z", "judge-a", "pass"), W("2026-06-03T00:00:00Z", "judge-a", "pass"), W("2026-06-04T00:00:00Z", "judge-a", "unverifiable")]),
  );
}
{
  const c = gCriterion(undefined); // no tolerance: the pinned default 3/3
  fx(
    "fx-grad-default-tolerance",
    "judgment object without tolerance: the default runs 3 agreement 3 is pinned in the wire format. Four records, oldest a fail - the default window is the latest three passes, satisfied; a different default gives insufficient-evidence or unreproducible.",
    "felag/graduation-input@0",
    gInput(c, [...calOk(c, "judge-a"), tgt(c, "judge-a", "fail", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-04T00:00:00Z")]),
    gResult("satisfied", [J("judge-a", true)], [W("2026-06-02T00:00:00Z", "judge-a", "pass"), W("2026-06-03T00:00:00Z", "judge-a", "pass"), W("2026-06-04T00:00:00Z", "judge-a", "pass")]),
  );
}

// --- graduation: window (ac-grad-window) ---
{
  const c = gCriterion(T2);
  fx(
    "fx-grad-window-latest",
    "Two old fails then two new passes at tolerance 2/2: the window is the LATEST runs records - satisfied. An implementation evaluating all records ever sees a split and refuses.",
    "felag/graduation-input@0",
    gInput(c, [...calOk(c, "judge-a"), tgt(c, "judge-a", "fail", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "fail", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-04T00:00:00Z")]),
    gResult("satisfied", [J("judge-a", true)], [W("2026-06-03T00:00:00Z", "judge-a", "pass"), W("2026-06-04T00:00:00Z", "judge-a", "pass")]),
  );
}
{
  const c = gCriterion(T1);
  fx(
    "fx-grad-instant-order",
    "A lexically greater but instant-earlier at never wins: the fail at 13:00:00+02:00 (11:00Z) loses to the pass at 12:00:00Z - satisfied. Lexical ordering selects the fail.",
    "felag/graduation-input@0",
    gInput(c, [...calOk(c, "judge-a"), tgt(c, "judge-a", "fail", "2026-06-01T13:00:00+02:00"), tgt(c, "judge-a", "pass", "2026-06-01T12:00:00Z")]),
    gResult("satisfied", [J("judge-a", true)], [W("2026-06-01T12:00:00Z", "judge-a", "pass")]),
  );
}
{
  const c = gCriterion(T1);
  fx(
    "fx-grad-tie-index",
    "Equal instants under different offsets (12:00Z and 14:00+02:00) tie to the greatest array index - the later-submitted fail wins the window and the basis is reproducible-fail; the window entry carries the at exactly as recorded, never normalized. A first-submitted tiebreak wrongly graduates.",
    "felag/graduation-input@0",
    gInput(c, [...calOk(c, "judge-a"), tgt(c, "judge-a", "pass", "2026-06-01T12:00:00Z"), tgt(c, "judge-a", "fail", "2026-06-01T14:00:00+02:00")]),
    gResult("reproducible-fail", [J("judge-a", true)], [W("2026-06-01T14:00:00+02:00", "judge-a", "fail")]),
  );
}
{
  const c = gCriterion(T3);
  const stale = { ...c, item: "An older obligation line, since amended." } as Criterion;
  fx(
    "fx-grad-stale-criterion",
    "A target record whose judgmentHash binds an amended (older) criterion text is stale and never qualifies: two current records remain - insufficient-evidence, window empty even though records qualify. Amending the judged text resets the evidence loudly.",
    "felag/graduation-input@0",
    gInput(c, [...calOk(c, "judge-a"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z", { judgmentHash: judgmentHash(stale) }), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z")]),
    gResult("insufficient-evidence", [J("judge-a", true)], []),
  );
}
{
  const c = gCriterion(T3);
  fx(
    "fx-grad-version-mismatch",
    "A target record whose conformanceVersion differs from the spec preamble's never qualifies: two matching records remain - insufficient-evidence.",
    "felag/graduation-input@0",
    gInput(c, [...calOk(c, "judge-a"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z", { conformanceVersion: "0.9.0" }), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z")]),
    gResult("insufficient-evidence", [J("judge-a", true)], []),
  );
}

{
  const c = gCriterion(T3);
  fx(
    "fx-grad-foreign-implementation",
    "A target record carrying another implementation's name never qualifies, even from an admissible judge: two own-records remain - insufficient-evidence. Dropping the implementation filter would let one implementation graduate on another's borrowed evidence.",
    "felag/graduation-input@0",
    gInput(c, [...calOk(c, "judge-a"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z", { implementation: "impl-b" }), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z")]),
    gResult("insufficient-evidence", [J("judge-a", true)], []),
  );
}
{
  const cs: Criterion = {
    record: "criterion",
    id: "jc-s",
    itemId: "it-x",
    contractId: "c-x",
    type: "scenario",
    class: "judgment",
    gherkin: "Given a conformance report\nWhen a stranger reads it\nThen every failing criterion is named plainly",
    force: "MUST",
    state: "active",
    source: "forethought",
    fixtures: ["anchor-fail", "anchor-pass"],
    judgment: { rubric: "Does the report name failures plainly?", tolerance: { runs: 1, agreement: 1 } },
  };
  fx(
    "fx-grad-scenario-projection",
    "A scenario-type judgment criterion: the projection draws its text from gherkin (item is absent). A calibrated judge and one passing target graduate it - an implementation hashing the absent item field computes a different projection, finds every record stale, and refuses.",
    "felag/graduation-input@0",
    { criterionId: "jc-s", implementation: "impl-a", records: [cal(cs, anchorFail, "judge-a", "fail", "2026-05-01T00:00:00Z"), cal(cs, anchorPass, "judge-a", "pass", "2026-05-01T00:01:00Z"), tgt(cs, "judge-a", "pass", "2026-06-01T00:00:00Z")], spec: [gPreamble, gItem, cs, anchorFail, anchorPass] },
    gResult("satisfied", [J("judge-a", true)], [W("2026-06-01T00:00:00Z", "judge-a", "pass")]),
  );
}
{
  const c = gCriterion(T1, { state: "proposed" });
  fx(
    "fx-grad-proposed",
    "Graduation is state-independent: a proposed criterion graduates identically to an active one - you test graduation before ratifying intent. Whether the result gates anyone is it-gating's business.",
    "felag/graduation-input@0",
    gInput(c, [...calOk(c, "judge-a"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z")]),
    gResult("satisfied", [J("judge-a", true)], [W("2026-06-01T00:00:00Z", "judge-a", "pass")]),
  );
}
// --- graduation: admissibility (ac-grad-admissibility) ---
{
  const c = gCriterion(T3);
  fx(
    "fx-grad-uncalibrated",
    "The lazy always-pass judge: correct on the pass anchor, says pass on the fail anchor too. Inadmissible - its three passing target runs count for nothing; basis no-admissible-judge. The fail anchor is what kills it.",
    "felag/graduation-input@0",
    gInput(c, [cal(c, anchorFail, "judge-a", "pass", "2026-05-01T00:00:00Z"), cal(c, anchorPass, "judge-a", "pass", "2026-05-01T00:01:00Z"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z")]),
    gResult("no-admissible-judge", [J("judge-a", false)], []),
  );
}
{
  const c = gCriterion(T3);
  const editedAnchor = { ...anchorPass, description: "Anchor before its last edit" } as Fixture;
  fx(
    "fx-grad-stale-calibration",
    "A calibration record bound to a superseded anchor line (fixtureHash differs from the current canonical hash) is stale: the judge is inadmissible until it recalibrates - no-admissible-judge, fail closed.",
    "felag/graduation-input@0",
    gInput(c, [cal(c, anchorFail, "judge-a", "fail", "2026-05-01T00:00:00Z"), cal(c, anchorPass, "judge-a", "pass", "2026-05-01T00:01:00Z", { fixtureHash: recordHash(editedAnchor) }), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z")]),
    gResult("no-admissible-judge", [J("judge-a", false)], []),
  );
}
{
  const c = gCriterion(T3);
  const olderText = { ...c, item: "An older obligation line, since amended." } as Criterion;
  fx(
    "fx-grad-stale-calibration-rubric",
    "A calibration record whose judgmentHash binds an amended (older) criterion text is stale even with a current fixtureHash: the judge is inadmissible until it recalibrates against the new text - no-admissible-judge. Staleness-checking calibration only on fixtureHash misses this.",
    "felag/graduation-input@0",
    gInput(c, [cal(c, anchorFail, "judge-a", "fail", "2026-05-01T00:00:00Z", { judgmentHash: judgmentHash(olderText) }), cal(c, anchorPass, "judge-a", "pass", "2026-05-01T00:01:00Z"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z")]),
    gResult("no-admissible-judge", [J("judge-a", false)], []),
  );
}
{
  const c = gCriterion(T3);
  fx(
    "fx-grad-calibration-latest",
    "A judge wrong on the fail anchor at first, correct on a later run: the latest calibration record per anchor decides - admissible, satisfied. An any-record or first-record reading refuses the judge.",
    "felag/graduation-input@0",
    gInput(c, [cal(c, anchorFail, "judge-a", "pass", "2026-05-01T00:00:00Z"), cal(c, anchorFail, "judge-a", "fail", "2026-05-02T00:00:00Z"), cal(c, anchorPass, "judge-a", "pass", "2026-05-01T00:01:00Z"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z")]),
    gResult("satisfied", [J("judge-a", true)], [W("2026-06-01T00:00:00Z", "judge-a", "pass"), W("2026-06-02T00:00:00Z", "judge-a", "pass"), W("2026-06-03T00:00:00Z", "judge-a", "pass")]),
  );
}
{
  const c = gCriterion(T2);
  fx(
    "fx-grad-mixed-judges",
    "Judge-a calibrated, judge-b lazy: judge-b's latest fail never qualifies, the window is judge-a's two passes - satisfied. Admitting the uncalibrated judge's records splits the window and refuses. Provenance lists both judges with computed admissibility.",
    "felag/graduation-input@0",
    gInput(c, [...calOk(c, "judge-a"), cal(c, anchorFail, "judge-b", "pass", "2026-05-01T00:02:00Z"), cal(c, anchorPass, "judge-b", "pass", "2026-05-01T00:03:00Z"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-b", "fail", "2026-06-03T00:00:00Z")]),
    gResult("satisfied", [J("judge-a", true), J("judge-b", false)], [W("2026-06-01T00:00:00Z", "judge-a", "pass"), W("2026-06-02T00:00:00Z", "judge-a", "pass")]),
  );
}
{
  const c = gCriterion(T3, { fixtures: ["anchor-pass", "anchor-pass2"] });
  fx(
    "fx-grad-corpus-inadequate",
    "A corpus of only pass anchors cannot discriminate a lazy judge: corpus-inadequate for every judge, calibration evidence notwithstanding.",
    "felag/graduation-input@0",
    gInput(c, [cal(c, anchorPass, "judge-a", "pass", "2026-05-01T00:00:00Z"), cal(c, anchorPass2, "judge-a", "pass", "2026-05-01T00:01:00Z"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z")], gSpec(c, [anchorPass, anchorPass2])),
    gResult("corpus-inadequate", [J("judge-a", false)], []),
  );
}
{
  const c = gCriterion(T3, { fixtures: ["anchor-fail", "anchor-fail2"] });
  fx(
    "fx-grad-corpus-no-pass",
    "The mirror inadequacy: a corpus of only fail anchors lacks a pass anchor - corpus-inadequate for every judge.",
    "felag/graduation-input@0",
    gInput(c, [cal(c, anchorFail, "judge-a", "fail", "2026-05-01T00:00:00Z"), cal(c, anchorFail2, "judge-a", "fail", "2026-05-01T00:01:00Z"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z")], gSpec(c, [anchorFail, anchorFail2])),
    gResult("corpus-inadequate", [J("judge-a", false)], []),
  );
}
{
  const c = gCriterion(T3, { fixtures: ["anchor-fail", "anchor-odd", "anchor-pass"] });
  fx(
    "fx-grad-corpus-unusable",
    "An anchor whose expected does not parse as exactly one verdict key makes the corpus inadequate: no judge can be admissible against an unreadable expectation - fail closed.",
    "felag/graduation-input@0",
    gInput(c, [...calOk(c, "judge-a"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z")], gSpec(c, [anchorFail, anchorOdd, anchorPass])),
    gResult("corpus-inadequate", [J("judge-a", false)], []),
  );
}
{
  const c = gCriterion(T3, { fixtures: ["anchor-extra", "anchor-fail"] });
  fx(
    "fx-grad-corpus-extra-key",
    "An anchor whose expected carries a key beyond verdict is not exactly {verdict}: corpus-inadequate. An implementation reading just the verdict key would find this corpus adequate and graduate.",
    "felag/graduation-input@0",
    gInput(c, [cal(c, anchorExtra, "judge-a", "pass", "2026-05-01T00:00:00Z"), cal(c, anchorFail, "judge-a", "fail", "2026-05-01T00:01:00Z"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z"), tgt(c, "judge-a", "pass", "2026-06-03T00:00:00Z")], gSpec(c, [anchorExtra, anchorFail])),
    gResult("corpus-inadequate", [J("judge-a", false)], []),
  );
}
{
  const c = gCriterion(T3);
  fx(
    "fx-grad-no-records",
    "Adequate corpus, no records at all: zero admissible judges among the input's records - no-admissible-judge, judges and window empty. An implementation answering insufficient-evidence misreads the precedence.",
    "felag/graduation-input@0",
    gInput(c, []),
    gResult("no-admissible-judge", [], []),
  );
}
{
  const c = gCriterion(T3);
  // U+E000 (BMP, above the surrogate range) vs U+10000 (astral): UTF-16
  // code-unit order puts the astral judge first (0xD800 < 0xE000); code-point
  // order puts the BMP judge first (0xE000 < 0x10000).
  const bmp = "judge-\uE000";
  const astral = "judge-\u{10000}";
  fx(
    "fx-grad-judges-order",
    "Two judges whose models differ above the BMP: the judges list orders ascending by Unicode code point of the canonical serialization - the U+E000 judge before the U+10000 judge. UTF-16 code-unit ordering reverses them.",
    "felag/graduation-input@0",
    gInput(c, [tgt(c, astral, "pass", "2026-06-01T00:00:00Z"), tgt(c, bmp, "pass", "2026-06-02T00:00:00Z")]),
    gResult("no-admissible-judge", [J(bmp, false), J(astral, false)], []),
  );
}

// --- graduation: guards (ac-grad-guards) ---
{
  const c = gCriterion(T3);
  fx(
    "fx-grad-schema-guard",
    "Graduation input missing implementation fails the wire format: E_SCHEMA alone, basis null.",
    "felag/graduation-input@0",
    { criterionId: "jc-1", records: [], spec: gSpec(c) },
    gResult(null, [], [], ["E_SCHEMA"]),
  );
}
{
  const c = gCriterion(T3);
  fx(
    "fx-grad-schema-record",
    "A record ingestJudgment rejects (unparseable at) fails the whole input at G1: E_SCHEMA alone - rejected records never reach a ledger, and an input carrying one graduates nothing.",
    "felag/graduation-input@0",
    gInput(c, [tgt(c, "judge-a", "pass", "yesterday")]),
    gResult(null, [], [], ["E_SCHEMA"]),
  );
}
{
  const c = gCriterion(T3);
  fx(
    "fx-grad-spec-invalid",
    "A spec failing lint (duplicate item id) stops at G2: E_SPEC_INVALID alone - without lint-validity 'the target criterion' is not well-defined.",
    "felag/graduation-input@0",
    { criterionId: "jc-1", implementation: "impl-a", records: [], spec: [gPreamble, gItem, gItem, c, anchorFail, anchorPass] },
    gResult(null, [], [], ["E_SPEC_INVALID"]),
  );
}
{
  const c = gCriterion(T3);
  fx(
    "fx-grad-unknown-criterion",
    "criterionId naming no criterion stops at G3: E_UNKNOWN_CRITERION alone.",
    "felag/graduation-input@0",
    { criterionId: "jc-nope", implementation: "impl-a", records: [], spec: gSpec(c) },
    gResult(null, [], [], ["E_UNKNOWN_CRITERION"]),
  );
}
{
  const advisory: Criterion = {
    record: "criterion",
    id: "jc-1",
    itemId: "it-x",
    contractId: "c-x",
    type: "checklist",
    class: "judgment",
    item: "While reporting, the implementation shall be clear.",
    force: "MUST",
    state: "active",
    source: "forethought",
    fixtures: [],
  };
  fx(
    "fx-grad-not-graduatable",
    "A judgment criterion without a judgment object stops at G4: E_NOT_GRADUATABLE alone - advisory by construction, graduation undefined.",
    "felag/graduation-input@0",
    { criterionId: "jc-1", implementation: "impl-a", records: [], spec: [gPreamble, gItem, advisory] },
    gResult(null, [], [], ["E_NOT_GRADUATABLE"]),
  );
}

// --- judgment ingest (ac-jud-ingest) ---
{
  const c = gCriterion(T3);
  fx(
    "fx-jud-ingest-target",
    "A target JudgmentRecord with all kind-required fields is accepted.",
    "felag/judgment-ingest@0",
    tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z"),
    { accepted: true, errors: [] },
  );
  fx(
    "fx-jud-ingest-calibration",
    "A calibration JudgmentRecord with all kind-required fields is accepted.",
    "felag/judgment-ingest@0",
    cal(c, anchorPass, "judge-a", "pass", "2026-06-01T00:00:00Z"),
    { accepted: true, errors: [] },
  );
  const invalid = tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z") as Record<string, unknown>;
  delete invalid.judgmentHash;
  invalid.verdict = "maybe";
  invalid.judge = { model: "judge-a", temperature: "0" };
  fx(
    "fx-jud-ingest-invalid",
    "Missing judgmentHash, a verdict outside the enum, and a judge object with keys beyond model: all three defects named - E_BAD_VERDICT, E_MISSING_FIELD, E_SCHEMA.",
    "felag/judgment-ingest@0",
    invalid,
    { accepted: false, errors: ["E_BAD_VERDICT", "E_MISSING_FIELD", "E_SCHEMA"] },
  );
  const kindCal = cal(c, anchorPass, "judge-a", "pass", "2026-06-01T00:00:00Z") as Record<string, unknown>;
  delete kindCal.fixtureHash;
  kindCal.implementation = "impl-a";
  kindCal.conformanceVersion = "1.0.0";
  fx(
    "fx-jud-ingest-kind",
    "A calibration record carrying implementation AND conformanceVersion (both kind-forbidden) and missing fixtureHash (kind-required): E_MISSING_FIELD and E_SCHEMA co-fire - calibration is a property of the judge, not of anyone's conduct.",
    "felag/judgment-ingest@0",
    kindCal,
    { accepted: false, errors: ["E_MISSING_FIELD", "E_SCHEMA"] },
  );
  const kindTgt = tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z") as Record<string, unknown>;
  delete kindTgt.conformanceVersion;
  kindTgt.fixtureId = "anchor-pass";
  kindTgt.fixtureHash = recordHash(anchorPass);
  fx(
    "fx-jud-ingest-kind-target",
    "A target record carrying fixtureId AND fixtureHash (both kind-forbidden) and missing conformanceVersion (kind-required): E_MISSING_FIELD and E_SCHEMA co-fire.",
    "felag/judgment-ingest@0",
    kindTgt,
    { accepted: false, errors: ["E_MISSING_FIELD", "E_SCHEMA"] },
  );
  const badHash = tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z") as Record<string, unknown>;
  badHash.judgmentHash = "sha256:not-64-lowercase-hex";
  fx(
    "fx-jud-ingest-bad-hash",
    "A judgmentHash that is not sha256: plus 64 lowercase hex is rejected with E_SCHEMA at the ledger's front door.",
    "felag/judgment-ingest@0",
    badHash,
    { accepted: false, errors: ["E_SCHEMA"] },
  );
}

// --- lint (ac-lint-tolerance, ac-lint-judgment-fixtures) ---
{
  const c = gCriterion({ runs: 4, agreement: 2 });
  fx(
    "fx-lint-bad-tolerance",
    "tolerance runs 4 agreement 2 sits exactly on the boundary 2 x agreement = runs: rejected with E_BAD_TOLERANCE - without strict majority, reproducible-pass and reproducible-fail could hold at once.",
    "felag/lint-input@0",
    { spec: gSpec(c) },
    { valid: false, errors: [{ code: "E_BAD_TOLERANCE", ref: "jc-1" }] },
    "c-interchange",
  );
  const unreachable = gCriterion({ runs: 1, agreement: 3 });
  fx(
    "fx-lint-tolerance-unreachable",
    "tolerance runs 1 agreement 3 passes the majority rule (2 x 3 > 1) but agreement exceeds runs: a window of 1 record can never carry 3 agreeing verdicts - rejected with E_BAD_TOLERANCE, the criterion would be permanently ungraduatable.",
    "felag/lint-input@0",
    { spec: gSpec(unreachable) },
    { valid: false, errors: [{ code: "E_BAD_TOLERANCE", ref: "jc-1" }] },
    "c-interchange",
  );
  const noCorpus = gCriterion(T3, { fixtures: [] });
  fx(
    "fx-lint-judgment-missing-fixtures",
    "A judgment criterion carrying a judgment object and an empty fixtures list: rejected with E_MISSING_FIXTURES - a graduation bar with no anchors is bare assertion.",
    "felag/lint-input@0",
    { spec: [gPreamble, gItem, noCorpus] },
    { valid: false, errors: [{ code: "E_MISSING_FIXTURES", ref: "jc-1" }] },
    "c-interchange",
  );
}

// --- verify integration (ac-gate-graduated) ---
const advisoryJc: Criterion = {
  record: "criterion",
  id: "jc-adv",
  itemId: "it-x",
  contractId: "c-x",
  type: "checklist",
  class: "judgment",
  item: "While reporting, the implementation shall be courteous.",
  force: "MUST",
  state: "active",
  source: "forethought",
  fixtures: [],
};
{
  const c = gCriterion(T1);
  const cProp = gCriterion(T1, {
    id: "jc-prop",
    state: "proposed",
    item: "While reporting conformance, the implementation shall state coverage plainly.",
    judgment: { rubric: "Does the report state coverage plainly?", tolerance: T1 },
  });
  fx(
    "fx-verdict-graduated-conforms",
    "An active gating judgment criterion graduates (calibrated judge, passing window at 1/1): verdict conforms. The non-graduatable judgment criterion beside it stays advisory with its VerificationRecord-borne verdict; the PROPOSED graduatable criterion appears nowhere - graduatable criteria never enter advisory, even with a VerificationRecord on file.",
    "felag/verify-input@0",
    {
      asOf: "2026-06-10T00:00:00Z",
      implementation: "impl-a",
      records: [
        { criterionId: "jc-adv", implementation: "impl-a", implementationVersion: "1.0.0", conformanceVersion: "1.0.0", verdict: "pass", evidence: "self-report", runner: "harness", at: "2026-06-01T00:00:00Z", attribution: "fixture" },
        { criterionId: "jc-prop", implementation: "impl-a", implementationVersion: "1.0.0", conformanceVersion: "1.0.0", verdict: "pass", evidence: "self-report", runner: "harness", at: "2026-06-01T00:00:00Z", attribution: "fixture" },
      ],
      judgmentRecords: [...calOk(c, "judge-a"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z")],
      spec: [gPreamble, gItem, c, cProp, advisoryJc, anchorFail, anchorPass],
      waivers: [],
    },
    { advisory: [{ criterionId: "jc-adv", verdict: "pass" }], conformanceVersion: "1.0.0", disputed: [], failing: [], implementation: "impl-a", verdict: "conforms", waived: [] },
  );
}
{
  const c = gCriterion(T1);
  fx(
    "fx-verdict-graduated-drifts",
    "A gating judgment criterion whose window reproducibly fails: the criterion fails like any other gating criterion - verdict drifts, named in failing.",
    "felag/verify-input@0",
    {
      asOf: "2026-06-10T00:00:00Z",
      implementation: "impl-a",
      records: [],
      judgmentRecords: [...calOk(c, "judge-a"), tgt(c, "judge-a", "fail", "2026-06-01T00:00:00Z")],
      spec: gSpec(c),
      waivers: [],
    },
    { advisory: [], conformanceVersion: "1.0.0", disputed: [], failing: ["jc-1"], implementation: "impl-a", verdict: "drifts", waived: [] },
  );
}
{
  const c = gCriterion(T3);
  fx(
    "fx-verdict-graduated-insufficient",
    "One target run against tolerance 3/3: insufficient evidence is a drift, exactly as a never-run fixture is - gating that can be dodged by not submitting evidence is not gating.",
    "felag/verify-input@0",
    {
      asOf: "2026-06-10T00:00:00Z",
      implementation: "impl-a",
      records: [],
      judgmentRecords: [...calOk(c, "judge-a"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z")],
      spec: gSpec(c),
      waivers: [],
    },
    { advisory: [], conformanceVersion: "1.0.0", disputed: [], failing: ["jc-1"], implementation: "impl-a", verdict: "drifts", waived: [] },
  );
}
{
  const c = gCriterion(T3);
  fx(
    "fx-verdict-graduated-waived",
    "No judgmentRecords field at all (optional, absent means empty) and an unexpired waiver on the gating judgment criterion: conforms-with-waivers, never bare conforms.",
    "felag/verify-input@0",
    {
      asOf: "2026-06-10T00:00:00Z",
      implementation: "impl-a",
      records: [],
      spec: gSpec(c),
      waivers: [{ criterionId: "jc-1", implementation: "impl-a", kind: "waiver", justification: "judge budget pending", attribution: "impl-a", expiresAt: "2027-01-01T00:00:00Z" }],
    },
    { advisory: [], conformanceVersion: "1.0.0", disputed: [], failing: [], implementation: "impl-a", verdict: "conforms-with-waivers", waived: ["jc-1"] },
  );
}
{
  const c = gCriterion(T1);
  const good = [...calOk(c, "judge-a"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z")];
  const poisoned = tgt(c, "judge-a", "pass", "not-a-time");
  fx(
    "fx-verdict-judgment-poisoned",
    "Evidence that would graduate the criterion plus one record ingestJudgment rejects (unparseable at): G1 fails the input through D1J - not graduated, drifts, fail closed. Filtering the bad record out and proceeding wrongly conforms.",
    "felag/verify-input@0",
    {
      asOf: "2026-06-10T00:00:00Z",
      implementation: "impl-a",
      records: [],
      judgmentRecords: [...good, poisoned],
      spec: gSpec(c),
      waivers: [],
    },
    { advisory: [], conformanceVersion: "1.0.0", disputed: [], failing: ["jc-1"], implementation: "impl-a", verdict: "drifts", waived: [] },
  );
}
{
  const c1 = gCriterion(T1);
  const c2 = gCriterion(T1, {
    id: "jc-2",
    item: "While reporting conformance, the implementation shall state waiver expiry plainly.",
    judgment: { rubric: "Does the report state waiver expiry plainly?", tolerance: T1 },
  });
  const goodFor = (c: Criterion) => [...calOk(c, "judge-a"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z")];
  const poisoned = tgt(c2, "judge-a", "pass", "not-a-time");
  fx(
    "fx-verdict-judgment-poisoned-cross",
    "Two gating judgment criteria, each with pristine graduating evidence, plus one rejected record naming only jc-2: the FULL judgmentRecords array is validated for every graduation, so BOTH criteria fail - drifts with failing [jc-1, jc-2]. An implementation that filters records per criterion before graduating wrongly conforms on jc-1.",
    "felag/verify-input@0",
    {
      asOf: "2026-06-10T00:00:00Z",
      implementation: "impl-a",
      records: [],
      judgmentRecords: [...goodFor(c1), ...goodFor(c2), poisoned],
      spec: [gPreamble, gItem, c1, c2, anchorFail, anchorPass],
      waivers: [],
    },
    { advisory: [], conformanceVersion: "1.0.0", disputed: [], failing: ["jc-1", "jc-2"], implementation: "impl-a", verdict: "drifts", waived: [] },
  );
}
{
  const c = gCriterion(T1, {
    state: "disputed",
    dispute: { by: "impl-a", reason: "rubric scope disputed", at: "2026-06-05T00:00:00Z" },
  });
  const specArr: SpecRecord[] = [gPreamble, gItem, c, anchorFail, anchorPass];
  fx(
    "fx-verdict-graduated-disputed-disputer",
    "A disputed graduatable judgment criterion does not gate the disputer: with no judgment evidence at all the disputer still conforms, the dispute listed loudly.",
    "felag/verify-input@0",
    { asOf: "2026-06-10T00:00:00Z", implementation: "impl-a", records: [], judgmentRecords: [], spec: specArr, waivers: [] },
    { advisory: [], conformanceVersion: "1.0.0", disputed: ["jc-1"], failing: [], implementation: "impl-a", verdict: "conforms", waived: [] },
  );
  fx(
    "fx-verdict-graduated-disputed-other",
    "The same disputed graduatable criterion gates every other implementer: impl-b with no judgment evidence drifts at it, the dispute listed loudly.",
    "felag/verify-input@0",
    { asOf: "2026-06-10T00:00:00Z", implementation: "impl-b", records: [], judgmentRecords: [], spec: specArr, waivers: [] },
    { advisory: [], conformanceVersion: "1.0.0", disputed: ["jc-1"], failing: ["jc-1"], implementation: "impl-b", verdict: "drifts", waived: [] },
  );
  // The projection excludes state and dispute, so evidence bound to the
  // criterion BEFORE the dispute still qualifies after it.
  const evidence = [
    cal(c, anchorFail, "judge-a", "fail", "2026-05-01T00:00:00Z"),
    cal(c, anchorPass, "judge-a", "pass", "2026-05-01T00:01:00Z"),
    tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z", { implementation: "impl-b" }),
  ];
  fx(
    "fx-verdict-graduated-disputed-evidence",
    "A third party's dispute stales no evidence: impl-b's records, gathered before the dispute, still graduate the now-disputed criterion - conforms, dispute listed loudly. An implementation binding the hash to the full criterion line (state and dispute included) wrongly drifts here.",
    "felag/verify-input@0",
    { asOf: "2026-06-10T00:00:00Z", implementation: "impl-b", records: [], judgmentRecords: evidence, spec: specArr, waivers: [] },
    { advisory: [], conformanceVersion: "1.0.0", disputed: ["jc-1"], failing: [], implementation: "impl-b", verdict: "conforms", waived: [] },
  );
}

// ---------------------------------------------------------------------------
// 5. Validate and write.
// ---------------------------------------------------------------------------

const NEW_CRITERIA = [
  "ac-jud-ingest",
  "ac-grad-guards",
  "ac-grad-admissibility",
  "ac-grad-window",
  "ac-grad-basis",
  "ac-gate-graduated",
  "ac-lint-tolerance",
  "ac-lint-judgment-fixtures",
];

const allFixtures = sortFixtures([...fixtures, ...newFixtures]);
const all = [...spec, ...allFixtures];

const lintResult = lint(all);
if (!lintResult.valid) {
  console.error(JSON.stringify(lintResult, null, 2));
  throw new Error("lint failed");
}
const authorResult = validateAuthorOutput({ spec: all, new: NEW_CRITERIA });
if (!authorResult.valid) {
  console.error(JSON.stringify(authorResult, null, 2));
  throw new Error("validateAuthorOutput failed");
}

writeFileSync(join(dir, "spec.jsonl"), serialize(spec));
writeFileSync(join(dir, "fixtures.jsonl"), serialize(allFixtures));
console.log(`spec.jsonl: ${spec.length} records; fixtures.jsonl: ${allFixtures.length} records (${newFixtures.length} new)`);
console.log("validateAuthorOutput: valid; lint: valid");
