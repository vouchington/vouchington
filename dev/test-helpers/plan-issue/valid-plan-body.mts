export const VALID_PLAN_BODY = `## Solves
- #7390
- Source: https://github.com/vouchington/vouchington/issues/7390

## Why
- Goal: complete plans.
- Root cause: scattered requirements.
- Chosen fix: one schema.

## KPIs
| KPI | Target | Measurement |
| --- | --- | --- |
| Compliance | 100% | validator |

## Alternatives analysis
| Alternative | Benefits | Costs or risks | Decision reason |
| --- | --- | --- | --- |
| No change | No code | Plans stay incomplete | Rejected because the contract is missing |
| Reuse existing workflow | Familiar entry point | Keeps scattered ownership | Rejected because one skill should own planning |
| Materially different skill | Focused contract | Adds one discovery entry point | Accepted because it centralizes planning |

## Affected files and modules
| Path or module | Existing or new | Role and change | Dependencies | Dependents |
| --- | --- | --- | --- | --- |
| dev/plan-issue | Existing | Validate | parser | CLI |

## Before and after
\`\`\`mermaid
flowchart LR
  Before --> After
\`\`\`
| Concern | Before | After |
| --- | --- | --- |
| Schema | partial | complete |

## Implementation plan
1. Validate schema.

## Affected tests
| Test | Existing or new | Why affected | Behavior to check before implementation |
| --- | --- | --- | --- |
| validate | Existing | Schema changes | Current accepted schema |

## New tests and scenarios
| Scenario | Setup | Expected outcome |
| --- | --- | --- |
| Hidden | comment | rejected |

## Documentation
| Document | Update |
| --- | --- |
| Planning skill | Document the schema |

## Verification steps
- \`pnpm exec vitest run --project dev-tools\`

## Live browser preflight
- Status: \`not-required\`

## Planning review
- Independent exploration: completed.
- Independent advisor/reviewer: completed.
- Finding: table structure needed stronger enforcement.
- Disposition: accepted because it prevents filler evidence.`
