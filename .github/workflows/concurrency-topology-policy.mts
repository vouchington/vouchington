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

export type ConcurrencyPolicy = {
  pending: ConcurrencyPendingBehavior
  cancellation: ConcurrencyCancellationBehavior
  scope: readonly ConcurrencyScope[]
}

function policy(
  pending: ConcurrencyPendingBehavior,
  cancellation: ConcurrencyCancellationBehavior,
  scope: readonly ConcurrencyScope[],
): ConcurrencyPolicy {
  return { pending, cancellation, scope }
}

const retained = (scope: readonly ConcurrencyScope[]) =>
  policy('coalesce-latest', 'retain-running', scope)
const conditional = (scope: readonly ConcurrencyScope[]) =>
  policy('coalesce-latest', 'conditional', scope)
const cancelling = (scope: readonly ConcurrencyScope[]) =>
  policy('coalesce-latest', 'cancel-running', scope)
export const concurrencyTopologyPolicy = {
  '.github/workflows/actionlint.yml': conditional(['pull-request', 'sha']),
  '.github/workflows/backend.yml': conditional(['event', 'pull-request', 'sha']),
  '.github/workflows/ci-tests-processing.yml': retained(['run']),
  '.github/workflows/ci.yml': conditional(['pull-request', 'sha']),
  '.github/workflows/cleanup-artifacts.yml': retained(['input-resource']),
  '.github/workflows/cloudflare-worker.yml': conditional(['event', 'pull-request', 'sha']),
  '.github/workflows/dispatch-completed-deploy.yml': retained(['event']),
  '.github/workflows/docs-publish.yml': retained(['run']),
  '.github/workflows/fix-dependabot.yml': retained(['ref']),
  '.github/workflows/fix-issue.yml': retained(['event']),
  '.github/workflows/fix-main-self-retry.yml': retained(['run']),
  '.github/workflows/fix-main.yml': cancelling(['event', 'sha']),
  '.github/workflows/ghcr-cleanup.yml': retained(['fixed-resource']),
  '.github/workflows/gitleaks.yml': conditional(['pull-request', 'sha']),
  '.github/workflows/harness-dispatch.yml': retained(['input-resource']),
  '.github/workflows/lambdas.yml': conditional(['event', 'pull-request', 'sha']),
  '.github/workflows/lint-links.yml': conditional(['pull-request', 'sha']),
  '.github/workflows/main-backend.yml': retained(['run']),
  '.github/workflows/main-checks.yml': retained(['fixed-resource']),
  '.github/workflows/main-cloudflare-worker.yml': retained(['fixed-resource']),
  '.github/workflows/main-lambdas.yml': retained(['fixed-resource']),
  '.github/workflows/main-storybook.yml': retained(['fixed-resource']),
  '.github/workflows/main-web.yml': retained(['run']),
  '.github/workflows/merge-queue-ejection.yml': retained(['pull-request', 'sha']),
  '.github/workflows/nightly.yml': retained(['fixed-resource']),
  '.github/workflows/plan-completion.yml': retained(['fixed-resource']),
  '.github/workflows/plan.yml': retained(['event']),
  '.github/workflows/pnpm-dedupe.yml': retained(['fixed-resource']),
  '.github/workflows/scheduled-prompts.yml': retained(['event', 'input-resource', 'sha']),
  '.github/workflows/shepherd.yml': retained(['event']),
  '.github/workflows/static.yml': conditional(['event', 'pull-request', 'sha']),
  '.github/workflows/storybook.yml': conditional(['input-resource', 'sha']),
  '.github/workflows/sync-articles.yml': retained(['run']),
  '.github/workflows/tooling.yml': conditional(['event', 'pull-request', 'sha']),
  '.github/workflows/web.yml': conditional(['event', 'pull-request', 'sha']),
} satisfies Record<string, ConcurrencyPolicy>
