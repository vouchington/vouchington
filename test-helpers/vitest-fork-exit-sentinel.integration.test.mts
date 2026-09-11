// Proves the sentinel (vitest-fork-exit-sentinel.mts) and the diagnostics reporter
// (vitest-worker-exit-diagnostics-reporter.mts) actually behave as designed under each of the
// five ways a fork can die plus the clean-exit case — not just that their formatters produce the
// right string for a hand-built input. Unit-testing the formatters alone (as the other specs in
// this file's neighborhood do) proves nothing about whether the sentinel fires under a real
// SIGKILL; only spawning a real `vitest run` subprocess against a fixture project with
// `pool: 'forks'` does. See vitest-fork-exit-crash-injector.mts's
// `injectForkCrash()`/`requestedForkCrashInjectMode()` for the VITEST_FORK_CRASH_INJECT fault
// injector this spec drives for five of the crash modes; the happy-path case below injects nothing
// and asserts the real pool-teardown signature instead — see that file's comment above
// FORK_CRASH_INJECT_MODES for why a sixth, `exit`, injected mode was dropped from the original
// plan (it was untestable without violating oxlint's ban on synthesizing process signals, and a
// clean fork was empirically confirmed to die by SIGTERM, not by calling its own process.exit()).
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import type { ForkCrashInjectMode } from './vitest-fork-exit-crash-injector.mts'

const execFileAsync = promisify(execFile)

const vitestCliPath = join(
  dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))),
  'vitest.mjs',
)
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const setupFilePath = join(repoRoot, 'test-helpers/vitest.setup.fork-exit-sentinel.mts')
const reporterModulePath = join(
  repoRoot,
  'test-helpers/vitest-worker-exit-diagnostics-reporter.mts',
)

const testDirs: string[] = []

async function makeFixture(mode: ForkCrashInjectMode | 'happy-path') {
  const dir = await mkdtemp(join(tmpdir(), `voucha-fork-exit-sentinel-${mode}-`))
  testDirs.push(dir)
  const reportsDir = join(dir, 'reports')
  await mkdir(reportsDir, { recursive: true })

  // --report-on-fatalerror covers the oom leg (a V8 fatal error auto-writes a report); the abort
  // leg self-writes via process.report.writeReport() in injectForkCrash(), which honors this same
  // --report-directory default. --max-old-space-size is only added for oom, so the other three
  // fixtures run with the ambient default heap and cannot spuriously trip it.
  const execArgv = [
    '--report-on-fatalerror',
    '--report-uncaught-exception',
    '--report-compact',
    `--report-directory=${reportsDir}`,
  ]
  if (mode === 'oom') execArgv.unshift('--max-old-space-size=64')

  await writeFile(
    join(dir, 'vitest.config.mts'),
    `import { createVitestWorkerExitDiagnosticsReporter } from ${JSON.stringify(reporterModulePath)}

export default {
  test: {
    pool: 'forks',
    setupFiles: [${JSON.stringify(setupFilePath)}],
    execArgv: ${JSON.stringify(execArgv)},
    reporters: ['default', createVitestWorkerExitDiagnosticsReporter()],
  },
}
`,
  )
  await writeFile(
    join(dir, 'fixture.test.mts'),
    `import { it } from 'vitest'

it('runs inside the fork under test', () => {})
`,
  )
  return { dir, reportsDir }
}

async function runFixtureVitest(dir: string, mode: ForkCrashInjectMode | 'happy-path') {
  // happy-path deliberately omits VITEST_FORK_CRASH_INJECT — same as a real CI fork, which never
  // sets it — so the fixture's only test runs to completion and dies solely from Vitest's own
  // pool teardown, not from anything this spec injects.
  const env =
    mode === 'happy-path'
      ? { ...process.env, CI: '' }
      : { ...process.env, VITEST_FORK_CRASH_INJECT: mode, CI: '' }
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [vitestCliPath, 'run'], {
      cwd: dir,
      env,
      timeout: 25_000,
    })
    return { exitCode: 0, stdout, stderr }
  } catch (error) {
    const execError = error as { code?: number; stdout?: string; stderr?: string }
    return {
      exitCode: execError.code ?? 1,
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? '',
    }
  }
}

async function listReportFiles(reportsDir: string): Promise<string[]> {
  try {
    return (await readdir(reportsDir)).filter(name => name.endsWith('.json'))
  } catch {
    return []
  }
}

describe('vitest fork exit sentinel — happy path plus five-mode fault injection', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it(
    'happy path: a clean run with no injected fault still produces a readable sentinel line',
    { timeout: 25_000 },
    async () => {
      const { dir } = await makeFixture('happy-path')

      const { stderr } = await runFixtureVitest(dir, 'happy-path')

      // ForksPoolWorker.stop() (vitest's cli-api.BK8pd4xc.js) always tears a fork down via
      // fork.kill(), i.e. SIGTERM — confirmed by running a real, fully passing backend fork
      // (backend/services/web-risk/state.test.mts under --project backend-data-stores) and
      // observing its only sentinel line read `mode=signal:SIGTERM code=143`. A fork that never
      // crashes still dies by signal, not by calling process.exit() itself, so that — not
      // mode=exit — is the real "everything worked" signature this case proves stays readable.
      expect(stderr).toMatch(/\[vitest-fork-exit\] pid=\d+ .*mode=signal:SIGTERM code=143\b/)
      // Exactly one line: before the trapSignal fix (process.exit(code) inside the handler,
      // which Vitest's module runner permanently stubs to throw), this cascaded into a second,
      // spurious `mode=exit` line for the same fork — the bug process.reallyExit() fixes.
      expect(stderr.match(/\[vitest-fork-exit\]/g)).toHaveLength(1)
    },
  )

  it(
    'mode=sigkill: absent sentinel, absent report, nonzero forks-without-sentinel count',
    { timeout: 25_000 },
    async () => {
      const { dir, reportsDir } = await makeFixture('sigkill')

      const { stderr } = await runFixtureVitest(dir, 'sigkill')

      expect(stderr).not.toMatch(/\[vitest-fork-exit\]/)
      expect(await listReportFiles(reportsDir)).toEqual([])
      expect(stderr).toContain('[vitest-worker-exit-diagnostics]')
      const sentinelCountMatch = /forks without an exit sentinel: (\d+)/.exec(stderr)
      expect(sentinelCountMatch).not.toBeNull()
      expect(Number(sentinelCountMatch![1])).toBeGreaterThan(0)
    },
  )

  it(
    'mode=abort: absent sentinel, diagnostic report with a populated native stack',
    { timeout: 25_000 },
    async () => {
      const { dir, reportsDir } = await makeFixture('abort')

      const { stderr } = await runFixtureVitest(dir, 'abort')

      expect(stderr).not.toMatch(/\[vitest-fork-exit\]/)
      // process.report.writeReport() (in injectForkCrash) and --report-on-fatalerror can both
      // fire for one abort, so more than one file may land here — the assertion must hold for
      // *some* report, not whichever readdir() happens to return first.
      const reportFiles = await listReportFiles(reportsDir)
      expect(reportFiles.length).toBeGreaterThan(0)
      const reports = await Promise.all(
        reportFiles.map(
          async name =>
            JSON.parse(await readFile(join(reportsDir, name), 'utf8')) as {
              nativeStack?: unknown[]
            },
        ),
      )
      expect(
        reports.some(report => Array.isArray(report.nativeStack) && report.nativeStack.length > 0),
      ).toBe(true)
    },
  )

  it(
    'mode=oom: either a populated uncaught-mode sentinel line, or an absent sentinel with a heap-limit report',
    { timeout: 25_000 },
    async () => {
      const { dir, reportsDir } = await makeFixture('oom')

      const { stderr } = await runFixtureVitest(dir, 'oom')

      const sentinelLine =
        /\[vitest-fork-exit\] pid=\d+ .*mode=uncaught .*heapLimitMB=(\d+(\.\d+)?)\b/.exec(stderr)
      const sentinelHeapLimitMB = sentinelLine ? Number(sentinelLine[1]) : 0

      // Always read the reports dir, rather than only on a missing sentinel line: oxlint's
      // no-conditional-expect rule bans branching expect() calls (a wrong branch would silently
      // skip the assertion instead of failing), so both signatures are computed unconditionally
      // and joined into one assertion below.
      const reportFiles = await listReportFiles(reportsDir)
      const reports = await Promise.all(
        reportFiles.map(
          async name =>
            // Node's diagnostic-report schema names this field `memoryLimit` (confirmed against a
            // real --report-on-fatalerror OOM report) — not `heapSizeLimit`, which is a different,
            // unrelated field from v8.getHeapStatistics()'s snake_case `heap_size_limit` that this
            // sentinel's own writeForkExitLine() reads instead.
            JSON.parse(await readFile(join(reportsDir, name), 'utf8')) as {
              javascriptHeap?: { memoryLimit?: number }
            },
        ),
      )
      const reportHasHeapLimit = reports.some(
        report => (report.javascriptHeap?.memoryLimit ?? 0) > 0,
      )

      // Either signature proves the crash was captured — a real V8 heap-OOM is a fatal,
      // unrecoverable abort (empirically: it never reaches the 'uncaughtException' handler, only
      // the report), so today only the reportHasHeapLimit disjunct fires. Both stay asserted
      // disjunctively rather than pinned to one, since that's the injector's documented contract
      // (see the oom branch of injectForkCrash) and a future V8/Node change that makes heap
      // exhaustion catchable should not need this assertion rewritten to match.
      expect(sentinelHeapLimitMB > 0 || reportHasHeapLimit).toBe(true)
    },
  )

  it(
    'mode=throw: populated uncaught-mode sentinel line carrying the injected error message',
    { timeout: 25_000 },
    async () => {
      const { dir } = await makeFixture('throw')

      const { stderr } = await runFixtureVitest(dir, 'throw')

      expect(stderr).toMatch(/\[vitest-fork-exit\] pid=\d+ .*mode=uncaught code=1\b/)
      expect(stderr).toContain(
        'errorMessage=injected uncaught exception for vitest-fork-exit-sentinel integration test',
      )
      // Proves formatForkExitSentinelSection's stack: line (rendered from the durable JSONL
      // record's errorStack) reaches the same job log as the sentinel line above — not just the
      // artifact-only record — for a real V8-produced stack, not a hand-built one.
      expect(stderr).toContain(
        'stack: Error: injected uncaught exception for vitest-fork-exit-sentinel integration test',
      )
    },
  )

  it(
    'mode=reject: populated unhandled-mode sentinel line carrying the injected error message',
    { timeout: 25_000 },
    async () => {
      const { dir } = await makeFixture('reject')

      const { stderr } = await runFixtureVitest(dir, 'reject')

      expect(stderr).toMatch(/\[vitest-fork-exit\] pid=\d+ .*mode=unhandled code=1\b/)
      expect(stderr).toContain(
        'errorMessage=injected unhandled rejection for vitest-fork-exit-sentinel integration test',
      )
      expect(stderr).toContain(
        'stack: Error: injected unhandled rejection for vitest-fork-exit-sentinel integration test',
      )
    },
  )
})
