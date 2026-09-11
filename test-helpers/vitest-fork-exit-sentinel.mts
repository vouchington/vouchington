// Registers, inside a Vitest fork, the last line of defense for naming how that fork died.
//
// `ForksPoolWorker`'s `emitUnexpectedExit` handler (vitest 4.1.10, cli-api.BK8pd4xc.js) declares
// no parameters, so the parent process discards the child's exit code and signal entirely — the
// structural reason a "Worker exited unexpectedly" failure carries no cause. This module writes a
// single, synchronous line from inside the dying fork itself, before the parent ever gets a say.
//
// Every write goes through `writeSync(2, …)` rather than `process.stderr.write` — the async stderr
// pipe (`ForksPoolWorker.start()`'s `this._fork.stderr.pipe(this.stderr)`) is exactly the channel
// that already loses data on an abrupt kill. A synchronous fd-2 write survives everything short of
// SIGKILL/SIGSEGV/a hard V8 abort — and the *absence* of this line for a fork Vitest reports as
// unexpectedly exited is itself the diagnostic: it proves a handler-unreachable death.
import { writeSync } from 'node:fs'
import { constants as osConstants } from 'node:os'
import { getHeapStatistics } from 'node:v8'
import {
  MAX_RECORDED_ERROR_STACK_CHARS,
  sanitizeInlineErrorMessage,
  toErrorDetail,
} from './vitest-fork-exit-error-detail.mts'
import { writeForkExitRecord, type ForkExitRecordMode } from './vitest-fork-exit-records.mts'
import { formatBytes, formatPercent } from './vitest-process-resources.mts'

// process.reallyExit exists on every Node runtime (it's the primitive process.exit() itself calls
// after emitting 'exit') but @types/node has never typed it — confirmed absent from
// @types/node@26.1.2's process.d.ts. It is used deliberately below: startModuleRunner() in
// vitest's base.B6Opl8PE.js permanently replaces process.exit with a stub that throws for the
// rest of the fork's life, specifically so an errant process.exit() call inside test code
// surfaces as a catchable error instead of killing the worker. That means the very handlers below
// — which need to *actually* terminate the fork after writing their line — cannot call
// process.exit() either. reallyExit bypasses the patch (it's a different function) and performs
// the exit syscall directly. The one behavioral difference that matters here: reallyExit does NOT
// emit Node's 'exit' event (verified empirically — a process.on('exit', ...) listener never fires
// before a reallyExit(code) call returns). Every call site below already wrote its own line via
// writeForkExitLine() first, so that's the correct behavior, not a gap: it avoids the alternative,
// which was observed and is worse — process.exit(code) throwing inside these handlers cascades
// into Vitest's own 'uncaughtException' listener (installed by listenForErrors() in
// init.k9zZ9sLh.js) and this module's, producing a spurious second `mode=exit` line for the same
// fork and, if that second process.exit() throws too, an untraceable "exception in the exception
// handler" crash.
declare global {
  namespace NodeJS {
    interface Process {
      reallyExit(code?: number): never
    }
  }
}

const SENTINEL_REGISTERED = Symbol.for('voucha.vitest-fork-exit-sentinel.registered')
const globalRef = globalThis as Record<symbol, boolean>

let currentModule: string | null = null
// isolate: false lets one fork run files from more than one project across a single invocation
// (our CI command passes six --project flags at once), so the project can't be fixed at
// registration time — it's tracked the same way as currentModule, from beforeEach.
let currentProject = 'unknown'

// Called from the setup file's beforeEach/afterEach so a mid-test death attributes to the file
// and project that were running, and a between-tests death (e.g. pool teardown) reports
// module=none.
export function setCurrentForkExitModule(modulePath: string | null): void {
  currentModule = modulePath
}

export function setCurrentForkExitProject(projectName: string | undefined): void {
  currentProject = projectName ?? 'unknown'
}

function writeForkExitLine(mode: ForkExitRecordMode, code: number, error?: unknown): void {
  const memory = process.memoryUsage()
  const heapLimitBytes = getHeapStatistics().heap_size_limit
  const errorDetail = mode === 'uncaught' || mode === 'unhandled' ? toErrorDetail(error) : undefined
  const fields = [
    '[vitest-fork-exit]',
    `pid=${process.pid}`,
    `project=${currentProject}`,
    `module=${currentModule ?? 'none'}`,
    `mode=${mode}`,
    `code=${code}`,
    `heapUsedMB=${formatBytes(memory.heapUsed)}`,
    `heapLimitMB=${formatBytes(heapLimitBytes)}`,
    `heapPctOfLimit=${formatPercent(memory.heapUsed, heapLimitBytes)}`,
    `rssMB=${formatBytes(memory.rss)}`,
    `uptimeMs=${Math.round(process.uptime() * 1000)}`,
  ]
  if (errorDetail) fields.push(`errorMessage=${sanitizeInlineErrorMessage(errorDetail.message)}`)
  writeSync(2, `${fields.join(' ')}\n`)
  // Durable file twin (see vitest-fork-exit-records.mts) — the roll-up in
  // vitest-worker-exit-diagnostics-reporter.mts reads this back from the main process, which
  // cannot see the stderr line above at all (it's piped straight to the job's raw log output, not
  // through Vitest's onUserConsoleLog channel). Carries the full message and stack, unlike the
  // bounded single-line fd-2 field above.
  writeForkExitRecord({
    kind: 'exit',
    pid: process.pid,
    project: currentProject,
    module: currentModule ?? 'none',
    mode,
    code,
    ...(errorDetail
      ? {
          errorMessage: errorDetail.message,
          ...(errorDetail.stack
            ? { errorStack: errorDetail.stack.slice(0, MAX_RECORDED_ERROR_STACK_CHARS) }
            : {}),
        }
      : {}),
  })
}

// Idempotent: multiple setup files across multiple projects may import this module inside the
// same fork (isolate: false reuses one fork across many files), and process.on listeners must
// only be attached once.
export function registerForkExitSentinel(): void {
  if (globalRef[SENTINEL_REGISTERED]) return
  globalRef[SENTINEL_REGISTERED] = true

  // Turns a future Node major removing this internal (see the module header comment) into an
  // immediate, attributable failure instead of a silent one: without it, every handler below would
  // throw when it tries to call reallyExit(), cascading into Vitest's own uncaughtException
  // listener and producing an untraceable crash rather than a clear cause.
  if (typeof process.reallyExit !== 'function') {
    throw new Error(
      'process.reallyExit is unavailable — the Node version may have removed this internal API. ' +
        'The fork-exit sentinel cannot terminate forks without it.',
    )
  }

  // Records that this fork started, independent of how it ends — see vitest-fork-exit-records.mts
  // for why this is the only way to count forks that die before writing anything else.
  writeForkExitRecord({ kind: 'start', pid: process.pid })

  // The normal path: every fork's process eventually exits, whether the pool recycles it or the
  // run ends. On a fully green run this is the only line these forks ever write.
  process.on('exit', code => {
    writeForkExitLine('exit', code)
  })

  // Preserve default crash semantics (non-zero exit) — this only adds attribution, it must not
  // turn a real crash into a silently-swallowed one. reallyExit(1), not exit(1): see the module
  // header comment — process.exit() is unusable here, and reallyExit's silence on the 'exit'
  // event is exactly right since the line for this death is already written above.
  process.on('uncaughtException', error => {
    writeForkExitLine('uncaught', 1, error)
    process.reallyExit(1)
  })
  process.on('unhandledRejection', reason => {
    writeForkExitLine('unhandled', 1, reason)
    process.reallyExit(1)
  })

  const trapSignal = (signal: NodeJS.Signals): void => {
    process.on(signal, () => {
      // 128+n mirrors POSIX/shell exit-code convention for a signal death, so the recorded
      // code stays interpretable even though we're now exiting deliberately rather than by
      // the raw signal.
      const code = 128 + (osConstants.signals[signal] ?? 0)
      writeForkExitLine(`signal:${signal}`, code)
      process.reallyExit(code)
    })
  }
  trapSignal('SIGTERM')
  trapSignal('SIGINT')
  trapSignal('SIGHUP')
}

// The fault injector this sentinel is tested against (VITEST_FORK_CRASH_INJECT) lives in
// vitest-fork-exit-crash-injector.mts — split out to keep this file, the always-on production
// code every fork runs, under the repo's 200-line cap and free of test-only concerns.
