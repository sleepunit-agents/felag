# governance/ — promotion artifacts

One triplet per ratification, named `<date>-<criterionId>.*`:

- **`input.json`** — the complete `felag/promotion-input@0` exactly as
  evaluated: the full record set (spec **and** fixtures — G2 lints the whole
  set) with the target criterion in `state: proposed`, the transition, and
  `asOf`. The verdict is independently reproducible from this file alone:
  `promote(input)` must equal `result.json` byte-for-byte (key-sorted).
- **`transition.json`** — the transition by itself (what `felag promote
  <spec-dir> <transition.json>` consumes).
- **`result.json`** — the `felag/promotion-result@0` verdict.

## Version semantics of the snapshot

The snapshot's preamble carries the version of the **release the
ratification completes** — for `ac-int-payload-number`, 2.0.0 — with the
criterion still `proposed`. That intermediate state never ships as a
release; it is the release candidate at the instant of evaluation. This is
deliberate: the ack endorses a criterion *for* the named release, and the
promotion function ignores the preamble version entirely (G2 cares only
about lint-validity; fixture inputs to the protocol are adversarial and
need not be committed specs).

## Amendments

Editing a proposed criterion after an ack is an ordinary PR — and it makes
the ack **stale** (`criterionHash` binds to the line as acknowledged).
`ac-int-payload-number` was ratified twice for exactly this reason: the
first ack (hash `e66209dd…`) endorsed a Given wrongly scoped to non-integer
numbers; the gherkin was amended and the criterion re-ratified under the
corrected text (hash `380e4af0…`). Only the final triplet is kept;
history lives in git, as the spec prescribes.
