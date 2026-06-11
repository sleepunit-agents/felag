# felag — a communal contract format for software, and the toolchain that tends it

*Draft v0 — 2026-06-11, Art + Jonathan riff. For Jonathan's review.*
*Status: design draft, pre-spec. The first real felag spec should be this document, compiled into the format it describes.*

---

## Name

Old Norse **félag**: *fé* (property, wealth) + *lag* (a laying-together) — a
fellowship formed by laying assets into common stock; the root of English
"fellow." A felag spec is exactly that: a contract laid in common, which any
party may implement with their own property (language, stack, taste).

The name is inherited from the retired felag substrate. This project is not
that project: it extracts the one idea from it worth keeping (the Spec kind
and its verification discipline) and discards the substrate.

## Thesis

1. **In the near future, spec distribution matters more than source
   distribution.** The scarce artifact is no longer the implementation — any
   competent agent can produce one — but the precise, verifiable statement of
   what the thing must do.
2. **Specs are authored and consumed as prose, but stored as a strict
   schema.** Humans speak prose; verification requires structure. The
   LLM's job is the membrane: interrogative compilation in (front-loading
   the human's judgment at authoring time), audience-targeted rendering out.
3. **A spec is a standing contract, not scaffolding.** Generation-era SDD
   tools (spec-kit, Kiro et al.) treat the spec as a launchpad discarded
   after codegen. felag treats it as the load-bearing wall: implementations
   drift, the spec is what they drift *from*, and the verifier measures it.
4. **The toolchain is itself specced in felag.** Adopters who care nothing
   for our stack can reimplement the reader/verifier in anything and verify
   their implementation against the felag spec of felag. Conformance is the
   ecosystem; the binary is incidental.

## The three strata (the word-processor test)

Run every statement of a candidate spec through the substitution test: *we
ship a TypeScript/shadcn rendering; a stranger ships a Rust TUI. Both must
satisfy the spec — and where declared, interoperate.*

| Stratum | Test | Lives | Example |
|---|---|---|---|
| **Behavioral core** | Two well-meaning implementations could observably diverge on it, within declared scope | The spec | "A user with role X can do Y"; "two users cannot hold the same claim simultaneously"; "documents serialize as <format>" *(when interop is declared)* |
| **Implementation profile** | Not load-bearing for strangers, but *we* want it consistently our way | A profile artifact alongside *our* implementation | TypeScript, Hono, better-sqlite3, shadcn, Woodpecker deploy |
| **Residue** | Nobody could "get it wrong" | Code, commits, nowhere special | It's purple |

Demarcation is **observable-contract vs execution-choice**, NOT technical vs
non-technical. Wire formats and protocols are deeply technical and can be
core — the word-processor case: our TS build and their Rust build must open
each other's documents, so the document format is core. Whether a given
boundary is contractual is declared, not inferred:

**Every spec opens with a scope preamble** stating goals and declared
contractual boundaries ("interop at the document format: yes; at the CLI
grammar: no"). The stranger-test is then precise: *core is every statement
two implementations could observably disagree about, within declared scope.*

Preferences are never anonymized out — they are **marked and relocated** into
the profile. The profile is a projection of the implementer's standing
preferences (for us: loom's preference manifest) onto one project: the
dossier pattern applied to a codebase. Adopters discard our profile and
substitute their own. felag owns the profile *format*; it never owns the
preference *source*.

## Data model (lifted from felag-v0's engineering-sdlc flavor, nearly verbatim)

```
Spec
├── preamble: goals, declared contracts, conformance version
├── sections[] → SpecItem
│     ├── id, title, body (prose)
│     ├── signature? (interface sketch — only when itself contractual)
│     └── acceptanceCriteria[] → AcceptanceCriterion
│           ├── type: scenario | checklist
│           ├── subtype: behavioral | judgment
│           ├── gherkin | item        (scenario → Gherkin; checklist → EARS-style sentence)
│           ├── force: MUST | SHOULD | MAY        (RFC-2119)
│           ├── source: forethought | discovered   ← the promotion seam
│           ├── discoveredAt / discoveredBy / triggeringEvent
│           └── refinement?
└── Profile (separate artifact, swappable)
```

Battle-tested forms only: Gherkin for scenarios, EARS for requirement
sentences, RFC-2119 for force, JSON Schema for the envelope. The
`source: discovered` provenance is the v0 inheritance that matters most —
implementation-time discoveries enter the spec marked, never silently.

**Promotion flow:** a choice surfaced at implementation time promotes to
**core** if it passes the stranger-test, to **profile** if it's a standing
preference, else remains residue. Promotion to core bumps conformance
version (additive criterion = minor; contract change = major). The verifier
reports against versions: "conforms to 1.2; drifts from 1.3 at criteria X, Y."

## Storage

**Embedded Dolt as source of truth, passive exports as interchange** — the
beads-proven pattern. Dolt gives the strict schema row-level history, diff,
branch/merge (spec proposals as branches), with zero server. The repo carries:

- `.felag/` — embedded Dolt database (authoritative)
- `spec/` — rendered exports: canonical JSONL (interchange) + markdown
  renderings (human-facing), regenerated on write, committed alongside

The **interchange format is the JSONL export + its JSON Schema** — that is
what the felag spec of felag defines. Dolt is our reference storage engine,
not a conformance requirement; a reimplementation that round-trips the
interchange format conforms. Distribution is plain git: files, diffs, PRs,
blame. Specs ride exactly the rails source code rides.

## Tool surface

A **library, MCP-first, CLI-parity** (`felag` binary for humans and bare
environments; MCP server for agents; both thin shells over the same lib).

| Verb | What it does |
|---|---|
| `author` | Interrogative prose→schema compilation. Interview flows for **greenfield** (goals → contracts → items → criteria) and **update** (delta interview). The interview's core script: *"Is this a contract or a choice? Could a stranger rebuild this and get it wrong?"* Front-loads human judgment; never silently invents criteria. |
| `excavate` | **Brownfield**: read an existing repo, propose the spec representing its current observable behavior — every criterion `source: discovered`, queued for human ratification. The spec starts as a mirror, then becomes the wall. |
| `verify` | Implementation vs behavioral core → conformance report per criterion: pass / fail / unverifiable. `behavioral` criteria verify mechanically where possible (scenarios → executable checks); `judgment` criteria route to an agent-as-judge protocol with the verdict recorded, never asserted by the implementer. |
| `audit` | Coverage analysis: which core items lack passing verification, which lack tasks. **Emits task *proposals* across the felag-tasks contract** (see below) to whatever conforming work layer is attached. felag-core computes coverage; it does not track work. |
| `render` | Audience projections from the single source of truth: stakeholder (criteria-only, user-observable prose — the "business-facing spec" is a render target, not a second document), developer (+ contracts + profile), verifier (raw schema). |
| `lint` | Schema + structural enforcement: criteria typed, force stated, scope preamble present, discovered criteria carry provenance. |
| `prime` | Emits the agent guidance: how to author, the interview protocols, the promotion rules — shipped *with* the library, beads-style enforcement posture. The skill/managed-block content is part of the product, versioned with it. |

## Seams — what felag owns, what it refuses

The beads lesson, applied in advance: beads is a fine work canvas that grew a
junk-drawer memory because nobody drew the line; had it left identity and
memory alone, we'd simply be running it. felag's boundaries are declared now,
in the spec, as conformance criteria — a junk-drawer feature is a *spec
violation*, not a roadmap item.

**felag owns:**
- the spec format, schema validation, and interchange definition
- conformance state — **derived, never asserted**: verification runs with
  timestamps per criterion ("done" *means* "verification passes"; there is no
  hand-set done bit)
- the interview/authoring protocols and their distribution (`prime`)
- the profile format (not profile content)
- drift detection and conformance-version semantics

**felag refuses to own:**
- **work state** — claims, assignment, sequencing, "what's next." That is the
  work layer. `audit` proposes tasks across the seam; it never tracks them.
  Authoring layer and working layer are different organs — concretely:
  **different specs** (felag-core and felag-tasks, below).
- **identity, memory, preference content** — the cognition layer (loom or
  anything). felag is fully operable by an agent with no persistent self.
- **execution** — it never spawns agents, runs implementations, or manages
  sessions. It is a format and a measuring instrument.

Assemble your tools as you see fit: repo (spec + code — world-facing),
work layer (task graph), cognition layer (judgment, taste, memory). felag is
deliberately the only mandatory piece for a stranger, and deliberately the
least interesting one to own.

## felag-tasks — the work layer as a contract, not an adapter

Integration-by-spec instead of integration-by-code. felag does not ship
adapters for beads/multica/Linear/etc. It ships:

1. **The felag-tasks spec** — a MUST-minimal work-layer contract: accept task
   proposals (with `specItemRef`), expose task status, report linkage. Written
   so that a *thin shim over an existing system* (beads, Linear, multica, a
   GTD relic) can conform without reimplementing anything. Conformance ≠
   reimplementation.
2. **A reference implementation** — small, bundled with the distribution
   (CLI + MCP), usable out of the box. It is a **sibling conformance unit**,
   not part of felag-core: its own spec, its own tables, talking to core only
   through the declared contract, exactly as a stranger's shim would.

**Structural guards (themselves conformance criteria on felag-core):**
- core operates correctly with any conforming work layer, *including none*;
  removing the bundled task system breaks nothing but convenience
- no work-state tables in core storage; no work verbs in the core verb set
- the bundled task system gains features only via its own spec

**Work-layer binding is personal, never project state.** You run one work
layer (the bundled one, your Linear shim, a goat with a calculator strapped
to its horns) — it's workstation config, not a committed artifact. Three
collaborators on the same spec may run three different conforming layers and
must interop: the interop key is the **`specItemRef`** — tasks are
projections of spec items, so any two layers projecting the same item are
provably the same unit of work. Shared truth in the repo = the spec and its
conformance/coverage state; who-is-doing-what = personal. (Cross-person claim
visibility for teams is an optional federation capability of the felag-tasks
contract, not a core concern — see open questions.)

**The onboarding story is the product demo:** after installing, your first
task is to take the bundled felag-tasks spec, modify it to fit how you work
(or to describe the tool you already use), and let the system build/verify
the conforming implementation or shim. The tutorial is the thesis.

**The migration story is the point:** when a hosted work system prices you
out (multica, June 2026), the spec is the source of truth — repopulating a
new conforming work layer is a shim swap, not an exodus.

## Open questions (for the next riff / v0 spec compilation)

1. **Judgment-criteria verification protocol** — agent-as-judge needs: rubric
   storage, verdict provenance (which model, what context), and re-judgment
   triggers. Sketch exists in loom's knowledge_verify; needs portable form.
2. **Profile schema depth** — flat key/values vs structured (stack, deploy,
   style, dependency policy)? Start flat, promote structure when it's earned.
3. **Spec-to-spec dependencies** — can a spec declare conformance to another
   spec (felag specs composing)? Likely yes via declared contracts; defer.
4. **Signature drift** — when `signature` fields exist, verify them
   mechanically against code? Cheap win for typed languages; defer past v0.
5. **Multi-spec repos** — monorepos with several specced units; namespace
   accordingly in `.felag/` from day one (cheap now, painful later).
6. **Where the canonical repo lives** and what happens to felag-v0 (archive
   with a pointer, or new repo `felag` + rename old to `felag-substrate-v0`).

## Relationship to the rest of the estate

- **beads**: our current live work store, and the first proof target for a
  felag-tasks conformance shim (a foreign system conforming via mapping, not
  reimplementation). Our own usage continues through the trial regardless.
- **loom**: wields felag (authoring taste, judgment verification, memory of
  decisions); never required by it. The profile generator reads loom
  preferences — through the seam, as an adapter.
- **felag-v0 (substrate)**: donor. Spec kind schema lifted nearly verbatim;
  spec-auditor becomes `audit`; spec-editor's interview instinct becomes
  `author`; the substrate (kinds/controllers/runtimes) stays retired.
