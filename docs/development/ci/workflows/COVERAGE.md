# Coverage

Each selected area workflow produces full LCOV for every suite it runs. Its `coverage` job merges
that LCOV and enforces the patch-coverage rules owned by that area; skipped areas pass their gate.
The independent `codecov` job uploads the same full LCOV under the suite's carryforward flag and
remains informational.

Full LCOV uploads are retained for one day and are the only coverage artifact handoff. Area
coverage is self-contained: it does not project sparse patch reports, exchange coverage manifests,
or depend on a cross-area fan-in. See [area patch coverage](../../reference-ci-coverage-gates.md#area-patch-coverage).

## Rules

[`.coverage-rules.yml`](../../../../.coverage-rules.yml) is first-match-wins. Every rule contains only a
`patch_coverage_min` threshold. Unmatched files are informational and do not fail the build.

| Scope                                                       | Minimum patch coverage |
| ----------------------------------------------------------- | ---------------------: |
| Cloudflare Worker                                           |                   100% |
| Lambdas, email templates, shared TypeScript, web API client |                   100% |
| Backend                                                     |                    95% |
| Web                                                         |                    80% |

Narrow exemptions for uninstrumented manifests, scripts, generated/test helpers, and integration
bodies must appear before their broader workspace rule.
