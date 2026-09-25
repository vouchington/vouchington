import { formatWorkerExitDiagnostics } from '../../test-helpers/vitest-ci-reporters.mts'
import { formatTeardownOverrunDiagnostics } from '../../test-helpers/vitest-teardown-overrun-diagnostics.mts'
import {
  formatDiagnosticReportSummaries,
  summarizeDiagnosticReport,
} from '../vitest-diagnostic-report-summary.mts'

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

// #8940: the new fork-exit sentinel, saturation sentinel, diagnostic-report summarizer, and
// unfinished-modules/sentinel-roll-up reporter sections all land in the same job log on a real
// trip. Every one of them must stay invisible to hasBackendUnitVitestFailure() — this mirrors the
// #8259 teardownInstrumentationLines block above for the fork-exit and diagnostics emitters.
export const forkExitSentinelLine =
  '[vitest-fork-exit] pid=4242 project=backend-mocks module=backend/services/jwt-session/flows.test.mts mode=exit code=0 heapUsedMB=812.3 heapLimitMB=4288.0 heapPctOfLimit=18.9 rssMB=940.1 uptimeMs=48213'
export const valkeySaturationLine =
  '[valkey-saturation] pid=4242 client=worker-queue-command command=xadd attempt=1 count=1'
// Mirrors the real SerializedError shape captured from a genuine occurrence (job 91338179263,
// run 30687491399 attempt 2 shard 2): Vitest's own object carries `type`/`stacks` (a ParsedStack[]
// keyed on frame index once run through serializeDiagnosticsError's structural walk), not a plain
// `{name, message}` pair, plus a short `stack` string that fits inside the reporter's 900-char
// truncation and so renders verbatim in the JSON dump.
export const workerExitDiagnosticsBlock = formatWorkerExitDiagnostics(
  'failed',
  [{ kind: 'started', moduleId: 'backend/services/jwt-session/flows.test.mts' }],
  // Not the sentinel/saturation lines themselves — those go through a raw synchronous fd-2 write,
  // bypassing Vitest's onUserConsoleLog channel entirely (see vitest-worker-exit-diagnostics-
  // reporter.mts's constructor comment). This is a generic stderr line the reporter's own channel
  // could plausibly have captured.
  ['stderr line before exit'],
  [
    {
      type: 'Unhandled Error',
      name: 'Error',
      message: '[vitest-pool]: Worker forks emitted error.',
      stack: 'Error: [vitest-pool]: Worker forks emitted error.\n    at EventEmitter.onTaskError',
      stacks: [
        { method: 'EventEmitter.onTaskError', file: 'cli-api.js', line: 3459, column: 21 },
        { method: 'ChildProcess.emitUnexpectedExit', file: 'cli-api.js', line: 3025, column: 22 },
      ],
      cause: {
        name: 'Error',
        message: 'Worker exited unexpectedly',
        stack: 'Error: Worker exited unexpectedly\n    at ChildProcess.emitUnexpectedExit',
        stacks: [
          { method: 'ChildProcess.emitUnexpectedExit', file: 'cli-api.js', line: 3023, column: 33 },
        ],
      },
    },
  ],
  ['backend/services/jwt-session/refresh.test.mts'],
  {
    startedPidCount: 2,
    exitRecords: [
      {
        kind: 'exit',
        pid: 4242,
        project: 'backend-mocks',
        module: 'backend/services/jwt-session/flows.test.mts',
        mode: 'exit',
        code: 0,
      },
    ],
    forksWithoutExitSentinel: 1,
  },
)
export const diagnosticReportSummaryBlock = formatDiagnosticReportSummaries([
  summarizeDiagnosticReport('report.14.json', {
    header: { trigger: 'FatalError', event: 'Allocation failed - JavaScript heap out of memory' },
    javascriptHeap: { usedMemory: 83_886_080, totalMemory: 92_274_688, memoryLimit: 4_294_967_296 },
    resourceUsage: { maxRss: 137_592_832 },
  }),
])
// A bounded excerpt of ci/host-pressure-diagnostics.sh's real section-header/body shape (that
// script is reused verbatim, not new — see the plan's "Reused, not rewritten" list — but this is
// its first appearance in a backend-unit job log, so the classifier must still be proven blind to
// it).
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
export const workerExitInstrumentationLines = [
  forkExitSentinelLine,
  valkeySaturationLine,
  workerExitDiagnosticsBlock.trim(),
  diagnosticReportSummaryBlock.trim(),
  hostPressureDiagnosticsBlock,
].join('\n')

export const workerExitAfterPassLogWithNewInstrumentation = workerExitAfterPassLog.replace(
  '##[error]Process completed with exit code 1.',
  `${workerExitInstrumentationLines}\n##[error]Process completed with exit code 1.`,
)
