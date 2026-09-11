Review static analysis coverage. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

References:

- https://oxc.rs/docs/guide/usage/linter/rules.html
- https://oxc.rs/docs/guide/usage/linter/js-plugins.html#known-supported-eslint-plugins

- Review other linting tools we use such as syncpack, lychee, knip, dependency-cruiser.
- Look at our current exceptions. Remove/fix the exceptions or make a GitHub issue to flag them.
- Skip any findings from open issues or open PRs.
- After a shared-parser migration, search for obsolete local split, regex, or tokenizer helpers and
  follow the [parser-library swap checklist](../../checklists/parser-library-swap.md) before removing
  one bounded leftover.

When the improvement touches ast-grep rules, include a hygiene pass:

- Review `not: regex` and `not: kind` constraints against unbound metavariables and document non-obvious binding semantics in rule comments.
- Check regex token boundaries so keys or identifiers such as `not_ssr` do not satisfy intended `ssr` matches.
- Confirm `sgconfig.yml` maps `.ts`/`.mts`/`.cts`/`.tsx` to `Tsx`, that shared invariants use one YAML file with both globs, and that no `-tsx` companion files exist.
- When a rule targets a callable or imported symbol, cover both bare and module-qualified forms and
  add fixtures that prove each intended match and near-miss.
- Add `examples:` fixtures for ignored paths when a rule relies on `ignores:` so drift is caught by the ast-grep example test.

Make linting stricter by enabling or configuring one useful existing lint/static-analysis rule, removing one stale exemption, or tightening coverage in an established tool. Add custom repo-local checks only after the [rule placement decision guide](../../../static-code-analysis/README.md#where-to-put-a-new-rule-priority-order) shows off-the-shelf tools, ast-grep, and no-mistakes cannot express the invariant. Do not remove existing rules or weaken coverage. Fix violations introduced by the selected improvement.
