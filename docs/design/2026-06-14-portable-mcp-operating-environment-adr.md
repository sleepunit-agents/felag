# ADR: Art's portable, MCP-driven operating environment

**Date:** 2026-06-14 · **Status:** accepted (architecture); program in progress

## Context

Art's operating environment — memory (loom), the spec/contract control plane
(felag), the work store (taskstore), and the `claude --bg` execution lanes —
runs on **one** and has been reachable only by *being on one* with a working
directory (a Claude Code session on the box). We want the same environment
**usable from any Claude client on the mesh** (Claude Desktop chat on spear, a
phone, another machine) without moving the data off one and without exposing it
to the internet or to Anthropic's cloud.

The unlock is MCP: loom and felag are already MCP servers; the OpenAI/MCP "MCP
Apps" extension (official 2026-01-26) lets a server return interactive UI
resources whose JS calls the server's tools directly via a host-mediated
postMessage bridge. So a thin client can drive a fat control plane that stays on
one.

## Decision

### Two surfaces, one source of truth

- **one** is the **source of truth and the compute**: data (git-backed specs,
  taskstore db, loom stores) and long-running daemons live here; `claude --bg`
  lanes execute here.
- **Clients are thin windows.** Two of them:
  - **Chat surface** (Claude Desktop chat on spear + MCP): no working directory.
    Does the **governance / authoring / orchestration** loop — everything felag
    and loom do is a *data operation over MCP*, not a filesystem operation. This
    is where the MCP-App widgets render.
  - **Code surface** (Claude Code on one): a working directory. Does
    **implementation** — writes code that conforms, runs the corpus. Reaches the
    servers locally.
- **The seam between them is taskstore** (shared work + status) and **git**
  (backup/sync). The chat surface fills the queue; lanes drain it; both surfaces
  read the same stores because they hit the **same daemon instance** on one.

### Transport & security: HTTP daemons, Tailscale-bound

- loom and felag run as **long-running HTTP MCP daemons on one, bound to the
  Tailscale interface** (not `0.0.0.0`). Only mesh devices can reach them — no
  internet exposure, nothing to firewall. **Tailscale is the access control.**
- The **desktop app is the MCP client** → connections are **spear → one over the
  mesh**, client-side. **Anthropic's cloud never connects to one**; it only ever
  receives tool *results* as conversation content (identical to any tool use
  today). The only path that would be cloud→one is a **claude.ai-web connector**
  — which can't reach a Tailscale-only host anyway, so: *use the desktop app's
  MCP client, never web connectors.*
- A persistent HTTP daemon (vs ephemeral stdio-over-SSH) is required because the
  control plane is **stateful** — it serves the UI resource, holds the workspace
  registry, and is the thing that lives **independent of any open chat**.
- **loom** rides the same model. Tailscale-bound = mesh-only = your devices.
  That is the boundary the "exposing my brain" itch wanted. Optional
  belt-and-suspenders: a bearer token on loom.

### felag-mcp as the control plane

felag-mcp stops being only a per-call data API and becomes the **control
plane**:

1. **Workspace registry** — a felag-owned, git-backed map on one,
   `name → {specDir, recordsFile, impl}`. This **replaces the working directory**
   as how felag resolves "which project." It is the **onboarding mechanism**: a
   project is onboarded by acquiring a registry entry (manual, a `felag_register`
   tool, or `/felag new` auto-registering what it creates). Every verb takes
   `{spec: "<name>"}`; a `felag_specs` discovery tool lists what exists; the
   MCP-App board opens with a spec picker.
2. **Dispatch verbs** — `felag_cold_review`, `felag_self_verify`,
   `felag_dispatch({scope})` — orchestrate background execution and return
   immediately. **Scoped verbs only; never an arbitrary-shell tool.** Dispatch is
   a felag **contract** (orchestrate execution + report status to the work
   store), with a **swappable execution-backend adapter** behind it — exactly as
   `felag-tasks` is a contract with `taskstore`/`beads` as swappable impls.
   `claude --bg` is *Art's* backend; another party swaps in `opencode`, a CI
   runner, etc., by taking the spec and changing the binding. The contract is
   public felag; the backend choice is the profile-binding.
3. **MCP-App UI** — a `ui://felag/board` resource: a lean shell that calls
   `felag_status` live (`app.callServerTool`) and renders via the existing
   `widget.mjs` functions *inside the iframe* (so the 93KB-blob problem
   disappears — the HTML is built client-side from a live call, never shipped
   through the model's context). Buttons make **real** calls
   (`felag_promote`, `felag_audit`, `felag_dispatch`).

### The dispatch / status loop (fire-and-forget, self-reporting)

The chat surface never waits on a response; it asks for **status**.

- `felag_dispatch` / `felag_cold_review` spawn a **`claude --bg` lane**
  (interactive/subscription pool) bound to a **taskstore task**. The lane does
  the work and **self-reports into taskstore** (it has the `taskstore` CLI on
  PATH): claimed → in_progress → done, with the result as a comment. The chat
  polls `taskstore show`/`report`.
- **taskstore is the status registry** — no new machinery. A dispatched job *is*
  a task.
- **Cold review** becomes a **context-stripped `claude --bg` lane** that writes
  its MERGE/REWORK + findings to taskstore — moving it off the `claude -p` SDK
  credit pool onto the interactive pool. *(Open test: that `claude --bg` accepts
  the context-strip flags `--setting-sources project --strict-mcp-config
  --mcp-config <empty>`; they are orthogonal to backgrounding, so expected to
  compose.)*
- **Billing discipline:** `--bg` (interactive pool) for work and recurring paths;
  `claude -p` (small SDK pool post-2026-06-15) only for genuinely occasional
  one-shots. Never `-p` on a loop.
- **Hung lanes** are caught by the existing **watchdog.timer** (ceremony 1).

### The orchestrator, done right

"felag, work the board" → `felag_dispatch({scope})` → a lane → taskstore. This
returns Art to orchestration — but on **first-party primitives** (felag-mcp +
`claude --bg` + taskstore), not a third-party orchestrator. The multica lesson
applied: every layer is yours and exportable (jsonl/git); **there is no rug to
pull.** It is the mothballed capability rebuilt on a foundation that can't
betray you.

### Public / private layering (felag is becoming a public product)

felag will be public-facing. So the boundary is not "felag = Art's tooling" but
**felag-the-public-product vs Art's-private-binding-built-on-it**, and felag's
own three-strata (contract / profile-binding / excluded) draws the line per
decision:

- **Public felag:** the format, the toolchain, the general MCP server (workspace
  registry, the `ui://felag/board` widget), and the **dispatch contract** — all
  vendor-neutral, forkable, "spec distribution > source distribution."
- **Art's private binding:** the specific execution backend (`claude --bg`), the
  particular lanes/config, and any Art-specific profile-binding in a spec.

This applies to **specs too**: a spec's public contract co-locates with the
(possibly public) impl it generates; only the Art-binding stratum stays private.
loom is the first instance — its public memory/knowledge contract goes with the
public `loomai` repo; the slice framed against Art's own stack (e.g. the
taskstore-shaped work-store refusal) is the private binding.

### Portability thesis (and the line that keeps it honest)

loom (memory) + felag (control plane) + taskstore (work), exposed as MCP, = the
whole operating environment reachable from any Claude client on the mesh, heavy
compute staying on one.

The sharpening: **the system is not *in* Claude — it persists on one, and Claude
is the agent that *operates* it.** Hold the line that it is true with zero chats
open (the daemons run, the lanes run, the data persists in git/db). Then
"usable anywhere" means *reachable from anywhere*, not *alive only while you're
looking*.

The one inherent dependency: the **agent layer is Claude** — the single thing
that cannot be first-partied away, because Art *is* a Claude. Keep that seam
clean (lanes take plain prompts; stores are plain jsonl) so the system is
**Claude-operated, not Claude-trapped** — drivable by a different agent someday.

## The program (decomposition)

This is a multi-spec program. felag specs its own evolution and loom's. Two
tracks plus this ADR; the topology is recorded *here* (it is deployment, not a
behavioral contract — felag specs say what an impl *does*, not *where it runs*).

**Track L — loom, brownfielded** (impl + spec, co-located):
- **L1.0 — fold `loom-spec` into the `loomai` repo.** The public memory/knowledge
  contract co-locates with the public impl it generates (forkable: "I want this
  but not this"); the Art-binding stratum stays a thin private overlay. loom
  carries the spec as committed artifacts; the public `loomai` build takes no
  hard `felag` dependency (felag reads/verifies from outside, as a dev tool).
  Retire the standalone `loom-spec` repo to whatever Art-private residue remains.
- **L1a — loom-memory.** *Already done* (ceremony 4 → `c-loom-memory` 0.1.0), but
  pre-6.0.0.
- **L1b — upgrade loom-memory to 6.0.0 honesty.** Apply evidence / projection /
  unfixturable where ceremony 4 used manual descriptive judgments for recall's
  non-determinism and side-effects. Closes the dogfood loop: the spec that
  *generated* t-7/t-8 adopts their solution.
- **L1c — excavate loom-knowledge** (`knowledge_*`) → `c-loom-knowledge`.
- **L1d — excavate loom-identity** (identity, bootstrap, harness_init) →
  `c-loom-identity`.
- **L2 — re-spec to-be:** network reachability, the mesh boundary, single-writer
  / write-lint discipline (fold in strictness epic art-ffc). The audit between
  as-is and to-be is the build list.
- **L3 — work it** (hand or dispatched).

**Track F — felag, the control plane** (authored/audited, already specced):
- **F1 — HTTP transport + workspace registry** (extends c-mcp). Chat-surface
  keystone; carries onboarding.
- **F2 — dispatch verbs** + taskstore-status (extends c-mcp). The orchestrator.
- **F3 — MCP-App board** (`ui://felag/board`). The face.

**Order:** L1b/L1c/L1d are independent of F and startable now from the code tab.
F1 is the chat-surface keystone everything chat-side waits on. The tracks run
parallel until L2/F2 meet at the dispatch loop.

## Open questions / to-test

1. `claude --bg` accepts the context-strip flags (cold-review on the interactive
   pool). **Load-bearing — test early.**
2. Claude Desktop's MCP client connects to a remote **HTTP MCP server at a
   Tailscale address** (confirm client-side; a ~5-minute test).
3. MCP-App resources render in **Claude Desktop chat** specifically (the research
   says Desktop is supported; Claude Code CLI is not).
4. Registry shape + lifecycle (the F1 design pass).

## Consequences

- felag-mcp gains shell power on one (spawning lanes) — acceptable because it is
  reached only via the authenticated mesh and scoped to specific dispatch verbs.
- A second always-on surface (the daemons) to operate and monitor — the watchdog
  and the existing lane discipline cover it.
- loom finally gets a full spec — the foundation art-ffc (strictness) has wanted.
