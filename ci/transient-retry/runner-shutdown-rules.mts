import { runnerShutdownLeafRerunMatch } from './runner-shutdown-consumers.mts'
import type { TransientRetryRule } from './types.mts'

export const runnerShutdownLeafRerunRule: TransientRetryRule = {
  id: 'runner-shutdown-leaf-rerun',
  consumerKey: 'idempotent-ci-leaf-process',
  rootCauseKey: 'runner-shutdown',
  description:
    'A runner shutdown cancels an idempotent CI leaf job before it completes, causing the leaf and its aggregate fan-ins to fail.',
  rationale:
    'Runner infrastructure terminates the process before tests or the build step complete; every unsuccessful-job log is available and contains no explicit kernel/cgroup OOM evidence, test assertion, setup failure, smoke-test failure, build error, or non-143 (non-SIGTERM) exit code. Downstream aggregate jobs (tests, build) fail only because the leaf did not complete; cancelled sibling consumer jobs with no failure signal are treated as downstream of a failed clean-shutdown leaf; Patch Coverage is treated as downstream only when a coverage-producing leaf failed; store-playwright-otel is treated as downstream only when a Playwright shard failed and the store job was skipped, cancelled, or failed solely because no Playwright OTel artifacts existed.',
  exampleRunIds: [
    '27846979399',
    '27869582352',
    '27755229439',
    '28357299849',
    '28552353759',
    '28513345722',
    '29191951985',
    '30503060858',
    '32069866705',
  ],
  // The consumer-specific failure guards prevent masking a real failure on either attempt.
  maxAttempts: 2,
  needsLogs: true,
  match: runnerShutdownLeafRerunMatch,
}
