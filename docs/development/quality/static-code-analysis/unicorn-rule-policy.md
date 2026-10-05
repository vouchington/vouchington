# Unicorn rule policy

[Issue #1692](https://github.com/vouchington/vouchington/issues/1692) originally proposed enabling every staged Unicorn rule. The subsequent per-rule user decisions supersede that blanket request. An `off` rule below is an intentional policy choice, not a remediation backlog.

## Approved enforcement

The approved remediation covers `no-anonymous-default-export`, `no-array-reverse`, `prefer-array-find`, `no-array-fill-with-reference-type`, and `no-empty-file`. Enable each approved rule as an error together with its existing callers and installed-Oxlint accepted/rejected fixtures.

`no-array-reverse` retains its default standalone expression-statement exception: intentional in-place reversal remains valid. Expression results use `toReversed()` when they need a reversed copy. `no-empty-file` accepts a documented `export {}` module marker when a package intentionally exposes no root API.

## Category exclusions

Exclude the remaining staged `pedantic` and `style` rules from #1692; existing enforcement remains unchanged. The staged rules covered by that decision are:

- `unicorn/consistent-assert`
- `unicorn/consistent-date-clone`
- `unicorn/consistent-existence-index-check`
- `unicorn/error-message`
- `unicorn/escape-case`
- `unicorn/explicit-length-check`
- `unicorn/filename-case`
- `unicorn/new-for-builtins`
- `unicorn/no-hex-escape`
- `unicorn/no-unnecessary-array-splice-count`
- `unicorn/no-useless-collection-argument`
- `unicorn/no-useless-promise-resolve-reject`
- `unicorn/no-zero-fractions`
- `unicorn/numeric-separators-style`
- `unicorn/prefer-at`
- `unicorn/prefer-bigint-literals`
- `unicorn/prefer-code-point`
- `unicorn/prefer-dom-node-text-content`
- `unicorn/prefer-structured-clone`
- `unicorn/prefer-type-error`
- `unicorn/relative-url-style`
- `unicorn/require-array-join-separator`

The existing web `prefer-bigint-literals` override remains in place. `prefer-string-raw` also remains intentionally off; use the simplest readable string spelling.

## Other intentional exclusions

- `unicorn/no-magic-array-flat-depth`: Documentation-style restriction; explicit numeric depth allowed.
- `unicorn/prefer-set-has`: Current string .includes false positive and conditional performance benefit; choose sets contextually.
- `unicorn/prefer-string-starts-ends-with`: Deprecated Unicorn rule; replacement typescript rule is style and excluded by user's policy; current findings are equivalent prefix spelling.
- `unicorn/no-invalid-fetch-options`: Installed Oxlint falsely treats dynamic method with POST default as GET; minimal probe reproduced.
- `unicorn/no-single-promise-in-promise-methods`: Single production finding is harmless redundant Promise.all wrapping; optional cleanup.
- `unicorn/no-useless-fallback-in-spread`: Six findings are harmless empty-object fallbacks in object spread; optional simplification.
- `unicorn/no-useless-length-check`: Explicit empty-case guard communicates performance gate intent despite being logically redundant.
- `unicorn/no-useless-spread`: Mostly optional allocation cleanup; snapshot iteration may be intentional and rule's fix is dangerous.
- `unicorn/require-module-specifiers`: Current empty export intentionally documents no classifier root API; valid TS module markers should remain allowed.

These choices do not prevent contextual cleanup. They prevent blanket enforcement that would reject valid module markers, snapshot iteration, dynamic fetch methods, or intentionally explicit guards.
