This is a pure reading task, so here is the review. Verdict first: the document's strongest idea — conformance is derived, never asserted — is also where it cheats the most. The two load-bearing mechanisms (`verify` for judgment criteria, Gherkin-to-executable binding) are undefined, and one of them explicitly lives inside loom. The stranger test, applied to this draft, fails at the core, not at the seams.

---

## Critical

**C1. The conformance instrument depends on loom, and on non-reproducible judgment.**

> "Sketch exists in loom's knowledge_verify; needs portable form."

That sentence is in "open questions," but the thing it defers is not peripheral — it's the verification protocol for `judgment` criteria, and the document elsewhere stakes everything on it: *"'done' means 'verification passes'; there is no hand-set done bit."* So for any spec containing a judgment criterion, "done" is currently defined by a protocol that exists only as a sketch inside the cognition layer felag claims to refuse. That is loom-coupling in the core, not behind a seam. Worse, even once ported: agent-as-judge means conformance varies by model, prompt, and day. For a *contract format*, non-deterministic conformance is foundational, not an open question. A stateless CI job cannot run `verify` on judgment criteria today, and tomorrow it can only run it if the spec pins judge model + rubric + context as part of the criterion itself — which the schema doesn't have fields for (rubric, judge identity, and re-judgment triggers are all listed as undefined).

*Fix:* either (a) judgment criteria are explicitly second-class — they appear in reports as `advisory`, never gate conformance, and "done" is defined over behavioral criteria only; or (b) the criterion schema embeds the rubric, the pinned judge configuration, and verdict-provenance fields, and the felag spec defines reproducibility requirements for verdicts. Pick one in v0; don't ship "no hand-set done bit" with an undefined judge.

**C2. "Scenarios → executable checks" hides the entire hard part: binding.**

> "`behavioral` criteria verify mechanically where possible (scenarios → executable checks)"

This is the Cucumber maintainer's chair, and they would not be gentle. Gherkin is not executable; it is prose with keywords. Every implementation needs step definitions — glue code mapping "a user with role X" onto *that* implementation's interfaces. The document never mentions glue, yet its central promise (our TS build and their Rust TUI both verify against the same spec) requires two independent teams to write two independent bindings of the same English sentences. Nothing guarantees those bindings interpret the steps the same way. Two implementations can both pass `verify` and still fail to interoperate, because the ambiguity lives in the binding, exactly where fifteen years of Cucumber deployments say it lives. The spec's verification story is only as strong as a binding contract it doesn't have.

*Fix:* make the binding layer a named artifact in the data model (per-implementation, like the profile), and make shared, canonical *interop test fixtures* — concrete input/output pairs, not just Gherkin — a first-class spec element for any declared interop contract. The IETF chair says the same thing from the other side: interop is proven by independent implementations against a shared test corpus, not by each party verifying against prose.

**C3. `verify` contradicts the execution refusal.**

> "felag refuses to own: … **execution** — it never spawns agents, runs implementations, or manages sessions."

Then how does `verify` turn scenarios into "executable checks," and how does it route judgment criteria to "an agent-as-judge protocol"? Running executable checks against an implementation *is* running the implementation; routing to a judge *is* spawning an agent, or at minimum managing a session with one. Either the refusal is false, or `verify` is actually a *report ingester* — it consumes externally-produced run results and derives conformance state — and the document never says which. These are very different tools: one is a test runner, the other is a ledger.

*Fix:* decide. The ledger model is more honest and more portable (CI runs the checks however it wants and submits structured results; felag validates and records). If so, the felag spec must define the result-submission format, which is currently absent from the data model.

**C4. The storage story contradicts "specs ride exactly the rails source code rides."**

> "`.felag/` — embedded Dolt database (authoritative) … Distribution is plain git: files, diffs, PRs, blame."

The authoritative artifact is a binary-chunked database committed into git. Git diff, blame, PR review, and three-way merge do not work on it. They work on the *exports* — which the document explicitly designates non-authoritative. So the actual collaboration workflow is broken in both directions: (a) two spec-proposal branches that each touch `.felag/` will produce git merge conflicts in opaque chunk files that git cannot resolve and Dolt's own merge machinery (which assumes Dolt remotes, not a Dolt directory inside a git repo) won't be invoked for; (b) the natural git act — a reviewer suggests an edit to the rendered markdown in a PR — has no defined round-trip back into Dolt. "Spec proposals as branches" is named as a feature and given zero merge semantics, including the obvious collision: two branches each bump the conformance version (minor), then merge. The beads precedent may genuinely work for beads; the claim here is unsupported for the multi-writer, PR-mediated workflow the document advertises.

*Fix:* invert authority. Make the JSONL interchange files the committed source of truth (they're line-oriented; git diff/merge/blame actually work), and make Dolt a local, regenerable index — a cache, like an LSP database. This also collapses the "reference storage engine" hedge: there'd be nothing to hedge.

---

## High

**H1. The "observably diverge" test over-captures, and the scope preamble is asked to do more than it's specified to do.**

> "core is every statement two implementations could observably disagree about, within declared scope."

Error message wording is observable and divergeable. So are exit codes, log formats, latency, pagination order, and the color purple if a screenshot test exists. By this test, core balloons until everything user-visible is contract — Hyrum's law installed as policy. The only restraint is the scope preamble, which gets one example clause ("interop at the document format: yes; at the CLI grammar: no") and no schema, no required negative declarations, no guidance on the default when scope is silent. Is undeclared scope in or out? That single default decides whether the format produces lean contracts or kudzu.

*Fix:* define the preamble's schema in the data model (it's currently one line: "goals, declared contracts, conformance version"), require scope to be closed-world (anything not declared contractual is residue by default), and show one worked example of *excluding* an observable behavior.

**H2. There is no governance, and the versioning rule is wrong.**

> "Promotion to core bumps conformance version (additive criterion = minor; contract change = major)."

The IETF chair's objection, twice over. First: an *additive MUST* is a breaking change — every existing implementation that conformed yesterday fails today. Calling it "minor" imports SemVer surface without SemVer semantics (in SemVer, minor means existing consumers keep working). Second, and bigger: who approves promotion? The entire promotion flow — implementer discovers something, stranger-tests it, promotes to core — is described as a unilateral act by one party, but promotion to core changes the contract for *every* implementer. The moment felag has its second independent implementation (which is the stated point of the project), it needs change control: who can propose, who must consent, what distinguishes errata from revision, how disputes about "does this pass the stranger test" get resolved. The document has a verification discipline and zero amendment discipline.

*Fix:* additive MUST = major. Additive SHOULD/MAY = minor. And add a governance section to the v0 spec, even if it's one paragraph ("spec changes merge via the same PR review as code; promotion to core requires sign-off from N declared implementers"), because silence here defaults to "whoever holds the repo," which contradicts the communal-contract framing in the name section.

**H3. `author` and `prime` embed an LLM — and Claude-Code-shaped concepts — into the mandatory piece.**

> "The LLM's job is the membrane" (thesis 2); "`felag` binary for humans and bare environments"; "`prime` … The skill/managed-block content is part of the product."

Three leaks. (1) Thesis 2 makes an LLM constitutive of the authoring path, but the CLI-parity claim promises `author` to "humans and bare environments." What does the interview do with no model attached? If the answer is "a human can hand-write the JSONL and run `lint`," say so — that's the actual no-agent path, and it's never stated. (2) "Skill/managed-block" is Claude Code vocabulary. A Gemini- or GPT-based agent has no skills directory and no managed blocks; if `prime`'s output format is part of the conformance surface ("felag owns: the interview/authoring protocols and their distribution"), you've put one vendor's packaging format into the contract. (3) "Beads-style enforcement posture" and "the dossier pattern" are estate-internal terms used as definitions. The cold reader — the document's declared audience — cannot parse the sentence defining what a profile *is* without already knowing loom.

*Fix:* `prime` emits a vendor-neutral document (plain markdown guidance + the protocols); harness-specific packaging is an adapter beyond the seam. Define the hand-authoring path explicitly. Replace "dossier pattern" with the actual definition in place.

**H4. `author`'s conformance criteria are unfalsifiable, which breaks thesis 4.**

> "Adopters … can reimplement the reader/verifier in anything and verify their implementation against the felag spec of felag."

Note the quiet narrowing: "reader/verifier." But felag's spec must cover its whole verb surface, and `author`'s key promises — "front-loads human judgment," "never silently invents criteria" — are not verifiable properties of an implementation; they're qualities of an interaction. The dogfooding thesis is circular: felag's own spec will lean on judgment criteria, whose verification protocol is open question #1. So "verify your reimplementation against the spec of felag" is currently true only for the parts that were already easy.

*Fix:* split the felag spec into conformance classes (see also H2): `felag-interchange` (reader/writer — fully mechanical), `felag-verifier`, `felag-author`. State plainly that author-conformance is partially judgment-verified and what that's worth. The IETF chair calls this conformance targets; the document has a single undifferentiated "conforming implementation," which is naive for a multi-role system (the word-processor example alone implies reader and writer roles with different obligations).

**H5. No demotion, no appeal, no "verification is wrong" path.**

The promotion flow is loving and detailed; there is no inverse. Criteria born from a bad interview (or a bad `excavate`) are permanent residents — no demotion, deprecation, or dispute mechanism appears anywhere. And having banned the hand-set done bit, the document provides no recourse when verification itself is wrong: a flaky executable check or a bad judge verdict produces a false `fail` that, by the document's own definition, *means* not-done, forever, with no documented override. Every test system that has banned overrides has reinvented them within a year (skip lists, quarantine, waivers); design the waiver now, with provenance, or inherit an undocumented one.

*Fix:* add `deprecated`/`disputed` criterion states with provenance mirroring `discovered`, and a recorded-waiver mechanism ("asserted-with-justification, expires") that shows up loudly in reports.

---

## Medium

**M1. `audit`'s task proposals erode the work seam.** Re-running `audit` must not re-propose tasks already proposed, which means `audit` must know what the work layer already holds — so "felag-core computes coverage; it does not track work" is true only if the felag-tasks contract includes idempotency keys (`specItemRef` plus criterion granularity, which is unspecified — items have criteria; tasks reference items; coverage is per-criterion). Define proposal idempotency in the felag-tasks contract or audit becomes a duplicate fountain. Relatedly, "cross-person claim visibility … optional federation capability" is the first junk-drawer feature, spotted in the wild, in the same document that declares junk-drawer features a spec violation.

**M2. "Shared truth in the repo = the spec and its conformance/coverage state" is underdefined.** Conformance is per-implementation and per-run, with timestamps. Whose runs get committed? Three collaborators with three work layers and (per the thesis) possibly multiple implementations will produce merge churn in committed verification state, or worse, silently overwrite each other's. Either conformance state is also personal/CI-owned (and the repo carries only the spec), or the document defines a merge rule for verification records.

**M3. `excavate` enshrines bugs and is unbounded.** "The spec starts as a mirror" — mirrors reflect bugs. Ratifying current observable behavior without a bug-vs-contract triage step converts every accident into a MUST. And "its current observable behavior" for any real repo is unbounded (see H1). The verb needs a scoping input and an explicit triage state (`discovered` → ratified | rejected | known-bug), only the first of which exists.

**M4. The data-model diagram contradicts the text.** The tree shows `Profile` as a child of `Spec`; the text says it's "a separate artifact, swappable" living "alongside *our* implementation." Trivial to fix, but in a document about strict schemas, the one schema shown is wrong about its own headline separation.

**M5. Identity-shaped fields in an identity-refusing system.** `discoveredBy`, and the planned verdict provenance ("which model, what context"), assume a stable answer to "who." felag refuses identity, fine — but then the spec must define what these fields contain for an ephemeral CI agent or a no-agent human. Probably just "free-form attribution string, no semantics" — but say it, or implementers will invent incompatible identity conventions and you'll own identity by accident, which is precisely the beads failure mode being warned against.

**M6. EARS checklist items are conflated with mechanical verifiability.** The table routes `behavioral` criteria to mechanical verification "where possible," but EARS sentences (the checklist form) are human-readable requirement prose — they are essentially never mechanically verifiable without exactly the binding work of C2. In practice every checklist criterion will fall through to judgment verification, which routes back to C1. Expect the behavioral/judgment split to be far more lopsided toward judgment than the document assumes.

---

## Lower / chairs not yet covered

- **PM, on the round-trip:** the stakeholder render is one-way. The first thing a real stakeholder does is edit the markdown or comment on it; there is no path from annotated render back through a delta interview. Without it, the "business-facing spec is a render target, not a second document" claim fails on contact — the edited render *becomes* the second document.
- **PM, on the demo:** "your first task is to take the bundled felag-tasks spec, modify it to fit how you work" — the onboarding asks a newcomer to perform spec modification, implementation generation, and verification before getting value. Nobody's first wish is to re-spec their task tracker. The real wedge is `excavate` on the user's own repo, which is currently the least-specified verb. Also unaddressed: the economics of standing contracts. Specs die because maintenance friction exceeds perceived value when deadlines bite; "the verifier measures drift" produces drift reports, and unactioned drift reports are noise. Who pays the upkeep, and what makes paying it cheaper than abandoning the spec, is the adoption question and it's nowhere.
- **PM, on cost:** judgment verification via agent-as-judge on every `verify` run has real latency and dollar cost; no incremental/caching story (only re-verify criteria whose items or implementation changed).
- **Cucumber chair, one more:** Gherkin's documented failure mode is scenario sprawl — thousands of low-value scenarios nobody reads. An LLM interview is a scenario *generator*; without granularity guidance or scenario budgets in the authoring protocol, `author` will industrialize the failure mode Cucumber spent a decade warning about.
- **Thesis 1 is unfalsifiable** ("in the near future, spec distribution matters more…"). Fine as motivation; it should not be numbered alongside testable design commitments, because reviewers will (correctly) treat the numbered list as claims the design must cash.
- **Self-application check:** the closing promise — *"the first real felag spec should be this document, compiled into the format it describes"* — is a good trap and the document walks into it. Run this draft through its own three strata: the Name section, both estate sections, and theses 1 and 3 are residue or profile; the actual behavioral core (interchange schema, verb contracts, versioning rules) is maybe a third of the text and the least finished third. Compiling this document as-is would mostly produce `judgment` criteria — which cannot currently be verified (C1). The dogfood test, today, fails.

---

**Summary of the three sharpest cuts:** (1) judgment verification is loom-resident and non-reproducible, yet "done" is defined by it — that's the stranger-test failure at the core; (2) mechanical verification is asserted but the binding layer that would make it real is absent — that's the design's biggest unexamined assumption; (3) the authoritative store doesn't actually ride git's rails — the collaboration story contradicts the storage choice. Fix those three and most of the High findings become tractable; skip them and the rest is rearranging deck prose.
