import { formatTeardownOverrunDiagnostics } from '../../test-helpers/vitest-teardown-overrun-diagnostics.mts'

const workerExitErrorBlock = [
  'Error: [vitest-pool]: Worker forks emitted error.',
  'Caused by: Error: Worker exited unexpectedly',
].join('\n')
export const workerExitAfterPassLog = [
  'Run pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend/data-stores/analytics --project backend/services/analytics --project backend/analytics-integration --project backend-data-stores --project backend-mocks --project backend-modules --project backend-test-helpers --project backend-email-templates --shard 1/2 --coverage',
  'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend/data-stores/analytics --project backend/services/analytics --project backend/analytics-integration --project backend-data-stores --project backend-mocks --project backend-modules --project backend-test-helpers --project backend-email-templates --shard 1/2 --coverage',
  'Vitest caught 1 unhandled error during the test run.',
  workerExitErrorBlock,
  'Test Files  829 passed | 2 skipped (832)',
  'Tests  5873 passed | 9 skipped (5882)',
  'Errors  1 error',
  '##[error]Process completed with exit code 1.',
].join('\n')

// #8259 teardownTimeout instrumentation (test-helpers/vitest.setup.data-stores.mts,
// vitest-teardown-overrun-diagnostics.mts): a real trip now also logs these lines. They must
// stay invisible to hasBackendUnitVitestFailure(), which gates the backend-unit runner-shutdown rerun.
export const teardownInstrumentationLines = [
  '[vitest-teardown] phase=queues start',
  '[vitest-teardown] phase=queues done ms=42',
  '[vitest-teardown] phase=native-drain start',
  '[vitest-teardown] phase=native-drain done ms=8',
  '[vitest-teardown] phase=data-stores start',
  '[vitest-teardown] phase=data-stores done ms=19842',
  '[vitest-teardown] total ms=19892',
  formatTeardownOverrunDiagnostics().trim(),
].join('\n')

export const workerExitAfterPassLogWithTeardownOverrun = workerExitAfterPassLog.replace(
  '##[error]Process completed with exit code 1.',
  `${teardownInstrumentationLines}\n##[error]Process completed with exit code 1.`,
)

// A bounded excerpt of ci/host-pressure-diagnostics.sh's section-header/body shape. The classifier
// must stay blind to it wherever that script's output lands in a backend-unit job log.
export const hostPressureDiagnosticsBlock = [
  '',
  '== host pressure diagnostics ==',
  '',
  '== memory and swap basics ==',
  '              total        used        free      shared  buff/cache   available',
  'Mem:            61Gi        12Gi       40Gi       1.2Gi       9.3Gi        48Gi',
  '',
  '== cgroup memory ==',
  'memory.current:',
  '2147483648',
  'memory.max:',
  'max',
  '',
  '== kernel OOM evidence ==',
  'no OOM-kill lines found within bounded reads',
].join('\n')
