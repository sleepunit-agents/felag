# Standards axis — smell baseline

Paste this into any cold review of CODE (a diff, a PR, a conformance build).
Not for spec reviews — those use the fixture-trace prompt in
`skills/felag-review`. `scripts/cold-review.sh --smells` appends this file to
the prompt. Adopted from mattpocock/skills `code-review` @ 6654f6b (Fowler,
*Refactoring* ch. 3), 2026-08-26, taskstore t-159.

## Two axes, reported separately, never merged or reranked

- **Standards** — does the code follow the repo's documented standards
  (`CODING_STANDARDS.md`, `CONTRIBUTING.md`, `CONTEXT.md` vocabulary), plus
  the baseline below? Report per file/hunk: (a) each breach of a documented
  standard, citing file + rule; (b) each baseline smell, named, with the hunk
  quoted. Documented-standard breaches can be hard violations; baseline smells
  are always judgement calls ("possible Feature Envy"). A documented repo
  standard overrides the baseline — where the repo endorses something the
  baseline would flag, suppress the smell. Skip anything tooling already
  enforces.
- **Spec** — does the code do what the spec / issue / fixtures asked? Report:
  requirements missing or partial; behaviour nobody asked for (scope creep);
  requirements that look implemented but wrong. Quote the spec line per
  finding. (In felag, `felag verify` is the mechanical half of this axis.)

End with findings-per-axis and the worst issue *within* each axis. Do not
pick a single worst across axes — that is the reranking the split exists to
prevent. A change can pass one axis and fail the other; reporting them
together lets one mask the other.

## The twelve smells (what it is → how to fix)

- **Mysterious Name** — a function, variable, or type whose name doesn't
  reveal what it does or holds. → rename; if no honest name comes, the design
  is murky.
- **Duplicated Code** — the same logic shape in more than one hunk or file
  of the change. → extract the shared shape, call it from both.
- **Feature Envy** — a method that reaches into another object's data more
  than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together
  (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain
  concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type
  recurs across the change. → polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across
  many files. → gather what changes together into one module.
- **Divergent Change** — one file or module edited for several unrelated
  reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for
  needs the spec doesn't have. → delete; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't
  depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly delegates onward. → cut
  it, call the real target direct.
- **Refused Bequest** — a subclass or implementer that ignores or overrides
  most of what it inherits. → drop the inheritance, use composition.
