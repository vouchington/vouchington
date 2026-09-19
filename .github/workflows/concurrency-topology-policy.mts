export type ConcurrencyPendingBehavior = 'coalesce-latest' | 'fifo'
export type ConcurrencyCancellationBehavior = 'cancel-running' | 'retain-running' | 'conditional'
export type ConcurrencyScope =
  | 'fixed-resource'
  | 'pull-request'
  | 'ref'
  | 'sha'
  | 'run'
  | 'event'
  | 'input-resource'
export const sharedConcurrencyFamilyOwners = {
  'harness-fleet-lane': [
    '.github/workflows/harness-dispatch.yml#dispatch',
    '.github/workflows/fix-dependabot.yml#triage-and-rerun',
    '.github/workflows/fix-dependabot.yml#check-duplicates',
    '.github/workflows/fix-dependabot.yml#render-prompt',
    '.github/workflows/fix-dependabot.yml#revalidate-dispatch',
    '.github/workflows/fix-issue.yml#gate',
    '.github/workflows/fix-issue.yml#render-prompt',
    '.github/workflows/fix-main.yml#triage-and-rerun',
    '.github/workflows/fix-main.yml#related-candidates',
    '.github/workflows/fix-main.yml#render-prompt',
    '.github/workflows/plan.yml#gate',
    '.github/workflows/plan.yml#render-prompt',
    '.github/workflows/shepherd.yml#gate',
    '.github/workflows/shepherd.yml#render-prompt',
    '.github/workflows/shepherd.yml#checkpoint-dispatch',
    '.github/workflows/shepherd.yml#escalate',
    '.github/workflows/scheduled-prompts.yml#select-prompt',
    '.github/workflows/fix-dependabot.yml#escalate',
    '.github/workflows/fix-issue.yml#escalate',
    '.github/workflows/fix-main.yml#escalate',
    '.github/workflows/fix-main.yml#classify-self-failure',
    '.github/workflows/fix-main-self-retry.yml#retry',
    '.github/workflows/fix-main-self-retry.yml#escalate-retry-failure',
    '.github/workflows/plan.yml#escalate',
  ],
} as const satisfies Record<string, readonly string[]>

export type SharedConcurrencyFamily = keyof typeof sharedConcurrencyFamilyOwners

export type ConcurrencyPolicy<Family extends string = SharedConcurrencyFamily> = {
  pending: ConcurrencyPendingBehavior
  cancellation: ConcurrencyCancellationBehavior
  scope: readonly ConcurrencyScope[]
  sharedFamily?: Family
}

function policy(
  pending: ConcurrencyPendingBehavior,
  cancellation: ConcurrencyCancellationBehavior,
  scope: readonly ConcurrencyScope[],
  sharedFamily?: SharedConcurrencyFamily,
): ConcurrencyPolicy {
  return { pending, cancellation, scope, ...(sharedFamily ? { sharedFamily } : {}) }
}

const retained = (scope: readonly ConcurrencyScope[], family?: SharedConcurrencyFamily) =>
  policy('coalesce-latest', 'retain-running', scope, family)
const conditional = (scope: readonly ConcurrencyScope[]) =>
  policy('coalesce-latest', 'conditional', scope)
const cancelling = (scope: readonly ConcurrencyScope[]) =>
  policy('coalesce-latest', 'cancel-running', scope)
const fifo = (scope: readonly ConcurrencyScope[], family?: SharedConcurrencyFamily) =>
  policy('fifo', 'retain-running', scope, family)
export const concurrencyTopologyPolicy = {
  '.github/workflows/actionlint.yml': conditional(['pull-request', 'sha']),
  '.github/workflows/build-backend.yml': retained(['pull-request', 'ref']),
  '.github/workflows/build-web.yml': retained(['pull-request', 'ref']),
  '.github/workflows/ci.yml': conditional(['pull-request', 'sha']),
  '.github/workflows/ci-tests-processing.yml': retained(['run']),
  '.github/workflows/cleanup-artifacts.yml': retained(['input-resource']),
  '.github/workflows/harness-dispatch.yml': retained(['input-resource']),
  '.github/workflows/harness-dispatch.yml#dispatch': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/fix-dependabot.yml': retained(['ref']),
  '.github/workflows/fix-dependabot.yml#triage-and-rerun': fifo(
    ['fixed-resource'],
    'harness-fleet-lane',
  ),
  '.github/workflows/fix-dependabot.yml#check-duplicates': fifo(
    ['fixed-resource'],
    'harness-fleet-lane',
  ),
  '.github/workflows/fix-dependabot.yml#render-prompt': fifo(
    ['fixed-resource'],
    'harness-fleet-lane',
  ),
  '.github/workflows/fix-dependabot.yml#revalidate-dispatch': fifo(
    ['fixed-resource'],
    'harness-fleet-lane',
  ),
  '.github/workflows/fix-dependabot.yml#escalate': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/fix-issue.yml': retained(['event']),
  '.github/workflows/fix-issue.yml#gate': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/fix-issue.yml#render-prompt': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/fix-issue.yml#escalate': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/fix-main.yml': cancelling(['event', 'sha']),
  '.github/workflows/fix-main.yml#triage-and-rerun': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/fix-main.yml#related-candidates': fifo(
    ['fixed-resource'],
    'harness-fleet-lane',
  ),
  '.github/workflows/fix-main.yml#render-prompt': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/fix-main.yml#escalate': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/fix-main.yml#classify-self-failure': fifo(
    ['fixed-resource'],
    'harness-fleet-lane',
  ),
  '.github/workflows/fix-main-self-retry.yml': retained(['run']),
  '.github/workflows/fix-main-self-retry.yml#retry': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/fix-main-self-retry.yml#escalate-retry-failure': fifo(
    ['fixed-resource'],
    'harness-fleet-lane',
  ),
  '.github/workflows/plan.yml': retained(['event']),
  '.github/workflows/plan.yml#gate': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/plan.yml#render-prompt': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/plan.yml#escalate': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/shepherd.yml': retained(['event']),
  '.github/workflows/shepherd.yml#gate': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/shepherd.yml#render-prompt': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/shepherd.yml#checkpoint-dispatch': fifo(
    ['fixed-resource'],
    'harness-fleet-lane',
  ),
  '.github/workflows/shepherd.yml#escalate': fifo(['fixed-resource'], 'harness-fleet-lane'),
  '.github/workflows/scheduled-prompts.yml': retained(['event', 'input-resource', 'sha']),
  '.github/workflows/scheduled-prompts.yml#select-prompt': fifo(
    ['fixed-resource'],
    'harness-fleet-lane',
  ),
  '.github/workflows/dependabot-pr-automerge.yml': cancelling(['pull-request', 'sha']),
  '.github/workflows/dispatch-completed-deploy.yml': retained(['event']),
  '.github/workflows/docs-publish.yml': retained(['run']),
  '.github/workflows/ghcr-cleanup.yml': retained(['fixed-resource']),
  '.github/workflows/gitleaks.yml': conditional(['pull-request', 'sha']),
  '.github/workflows/lint-links.yml': conditional(['pull-request', 'sha']),
  '.github/workflows/main-backend.yml': retained(['run']),
  '.github/workflows/main-checks.yml': retained(['fixed-resource']),
  '.github/workflows/main-cloudflare-worker.yml': retained(['fixed-resource']),
  '.github/workflows/main-lambdas.yml': retained(['fixed-resource']),
  '.github/workflows/main-storybook.yml': retained(['fixed-resource']),
  '.github/workflows/main-web.yml': retained(['run']),
  '.github/workflows/pnpm-dedupe.yml': retained(['fixed-resource']),
  '.github/workflows/static-code-analysis.yml': conditional(['pull-request', 'ref']),
  '.github/workflows/static-code-analysis.yml#no-mistakes-owned': fifo(['fixed-resource']),
  '.github/workflows/storybook.yml': retained(['input-resource', 'sha']),
  '.github/workflows/sync-articles.yml': retained(['run']),
  '.github/workflows/tests-playwright-credentialed.yml': retained(['pull-request', 'sha']),
  '.github/workflows/tests-playwright.yml': retained(['pull-request', 'ref', 'sha']),
  '.github/workflows/tests-portability.yml': retained(['pull-request', 'ref']),
} satisfies Record<string, ConcurrencyPolicy>
