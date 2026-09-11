// oxlint-disable max-lines -- Storybook-specific cache/retry policy and the per-attempt
// telemetry/watchdog classifier share the same result mapping and must change atomically.
import { spawn as defaultSpawn, spawnSync } from 'node:child_process'
import {
  cpSync as defaultCpSync,
  existsSync as defaultExistsSync,
  mkdirSync as defaultMkdirSync,
  rmSync as defaultRmSync,
  writeFileSync as defaultWriteFileSync,
} from 'node:fs'
import { resolve } from 'node:path'

import {
  isProcessGroupAlive,
  runBrowserSession,
  type BrowserSessionDeps,
  waitForProcessGroupExit,
} from 'vouchington-tooling/browser-session-runner'

import {
  makeAttemptEnv,
  parsePositiveInteger,
  storybookBrowserAttemptCacheDir,
  vitestArgs,
} from './storybook-browser-runner-env.mts'
import {
  StorybookBrowserBootstrapTelemetry,
  type StorybookBrowserBootstrapSnapshot,
} from './storybook-browser-bootstrap-telemetry.mts'
import { StorybookBrowserDiagnostics } from './storybook-browser-runner-diagnostics.mts'
import { storybookBrowserRuntimeMetadata } from './storybook-browser-runtime-metadata.mts'
import {
  hasStorybookBrowserViteDependencyReady,
  hasStorybookBrowserViteReady,
  hasStorybookViteNewDependenciesFound,
  hasStorybookViteOptimizerReload,
  parseStorybookViteNewDependencies,
  stripAnsi,
} from './transient-retry/storybook-shared.mts'
import { latestStorybookProgressSequence } from '../test-helpers/vitest-storybook-progress-reporter.mts'

export { makeAttemptEnv } from './storybook-browser-runner-env.mts'

export type StorybookBrowserRunnerDeps = {
  clearInterval: typeof clearInterval
  clearTimeout: typeof clearTimeout
  cpSync: typeof defaultCpSync
  cwd: string
  existsSync: typeof defaultExistsSync
  isProcessGroupAlive: typeof isProcessGroupAlive
  killProcessGroup: (pid: number, signal: NodeJS.Signals) => void
  mkdirSync: typeof defaultMkdirSync
  now: () => number
  offParentSignal: BrowserSessionDeps['offParentSignal']
  onParentSignal: BrowserSessionDeps['onParentSignal']
  rmSync: typeof defaultRmSync
  setInterval: typeof setInterval
  setTimeout: typeof setTimeout
  spawn: typeof defaultSpawn
  stderr: Pick<NodeJS.WriteStream, 'write'>
  stdout: Pick<NodeJS.WriteStream, 'write'>
  writeFileSync: typeof defaultWriteFileSync
  waitForProcessGroupExit: typeof waitForProcessGroupExit
}

type AttemptResult = {
  budgetExpired: boolean
  code: number
  durationMs: number
  exitCode: number | null
  firstTestOutputAtMs: number | null
  hung: boolean
  isStall: boolean
  lastOutputAgeMs: number
  optimizerReadyAtMs: number | null
  runnerMissing: boolean
  resultFileDetectedAtMs: number | null
  retryable: boolean
  semanticProgress: boolean
  semanticStall: boolean
  signal: NodeJS.Signals | null
  viteReady: boolean
  bootstrap: StorybookBrowserBootstrapSnapshot
  viteFetchFailure: boolean
  optimizerReloadFromNewDeps: boolean
  newOptimizeDeps: string[]
}

type CachePlan = {
  dir: string
  persistentDir: string | undefined
  role: 'attempt' | 'persistent'
}

const optimizerProgressPattern = /\[optimizer\] (?:scanning|bundling) dependencies/
const viteServerFetchFailurePattern =
  /Failed to fetch dynamically imported module: http:\/\/localhost:\d+\//
// Runner-missing detection latches two independent markers (see hasAddonVitestSetupFile /
// vitestRunnerMissingMarker). The markers are matched separately, never as one regex spanning
// both, because the full "Failed to import test file … Vitest failed to find the runner" error
// block is ~1100 chars — larger than the 1000-char outputBuffer window — so the two ends cannot
// co-occur in a single snapshot once the trailing (path-repeating) stack frame is buffered.
const addonVitestSetupFilePathMarker = '/@storybook/addon-vitest/'
const addonVitestSetupFileNameMarker = '/vitest-plugin/setup-file.js'
const vitestRunnerMissingMarker = 'Vitest failed to find the runner'
const browserSessionConnectionTimeoutPattern =
  /Failed to connect to the browser session "[^"]+" \[web-storybook-browser \(chromium\)\] within the timeout\./
const storybookBrowserTestOutputPattern = /\|web-storybook-browser|\n\s*(?:[✓✗✘] )?Test Files\s+/
const resultFiles = [
  '.vitest-reports/web-storybook-browser.json',
  'coverage/lcov.info',
  'storybook-browser-test-report.junit.xml',
]

const defaultDeps: StorybookBrowserRunnerDeps = {
  clearInterval,
  clearTimeout,
  cpSync: defaultCpSync,
  cwd: process.cwd(),
  existsSync: defaultExistsSync,
  isProcessGroupAlive,
  killProcessGroup: (pid, signal) => {
    const result = spawnSync('kill', [`-${signal.replace(/^SIG/, '')}`, `-${pid}`], {
      stdio: 'ignore',
    })
    if (result.status !== 0 || result.error)
      throw result.error ?? new Error(`kill exited ${result.status}`)
  },
  mkdirSync: defaultMkdirSync,
  now: Date.now,
  offParentSignal: (signal, listener) => process.off(signal, listener),
  onParentSignal: (signal, listener) => process.on(signal, listener),
  rmSync: defaultRmSync,
  setInterval,
  setTimeout,
  spawn: defaultSpawn,
  stderr: process.stderr,
  stdout: process.stdout,
  writeFileSync: defaultWriteFileSync,
  waitForProcessGroupExit,
}

export async function runStorybookBrowserTests(
  options: { env?: NodeJS.ProcessEnv } = {},
  deps: StorybookBrowserRunnerDeps = defaultDeps,
): Promise<number> {
  const env = { ...process.env, ...options.env }
  const attempts = Math.min(parsePositiveInteger(env.STORYBOOK_BROWSER_STARTUP_ATTEMPTS, 3), 3)
  const stallMs = parsePositiveInteger(env.STORYBOOK_BROWSER_OPTIMIZER_STALL_MS, 30_000)
  const hangMs = parsePositiveInteger(env.STORYBOOK_BROWSER_HANG_MS, 120_000)
  const sessionBudgetMs = parsePositiveInteger(env.STORYBOOK_BROWSER_SESSION_BUDGET_MS, 300_000)
  const terminationGraceMs = Math.min(5000, sessionBudgetMs)
  const sessionDeadlineAt = deps.now() + sessionBudgetMs
  const diagnostics = new StorybookBrowserDiagnostics()
  const runtimeSummary = `[storybook-browser] runtime=${JSON.stringify(storybookBrowserRuntimeMetadata())}\n`
  deps.stderr.write(runtimeSummary)
  diagnostics.recordAttempt(runtimeSummary)
  const diagnosticsPath = resolve(
    deps.cwd,
    env.STORYBOOK_BROWSER_DIAGNOSTICS_FILE ?? 'storybook-browser-diagnostics.log',
  )

  const persistentCacheDir = storybookBrowserPersistentCacheDir(env, deps.cwd)
  let cachePlan: CachePlan | undefined
  let priorHang = false
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    clearResultFiles(deps)
    const attemptEnv = makeAttemptEnv(env, attempt, deps.cwd, priorHang)
    cachePlan ??= initialCachePlan(attemptEnv, persistentCacheDir)
    attemptEnv.VITEST_STORYBOOK_BROWSER_CACHE_DIR = cachePlan.dir
    if (cachePlan.role === 'persistent') deps.mkdirSync(cachePlan.dir, { recursive: true })
    deps.stderr.write(
      `[storybook-browser] starting attempt ${attempt}/${attempts} with ${cachePlan.role} cache ${cachePlan.dir}; optimizerStallMs=${stallMs}; hangMs=${hangMs}\n`,
    )
    const result = await runUpstreamAttempt(
      attemptEnv,
      stallMs,
      hangMs,
      sessionDeadlineAt,
      terminationGraceMs,
      diagnostics,
      deps,
    )
    const summary = formatAttemptResult(attempt, result)
    deps.stderr.write(summary)
    diagnostics.recordAttempt(summary)
    if (result.optimizerReloadFromNewDeps) {
      const packages =
        result.newOptimizeDeps.length > 0 ? result.newOptimizeDeps.join(', ') : 'unknown packages'
      const guidance =
        `[storybook-browser] Vite discovered new optimizeDeps during the browser run: ${packages}. ` +
        'Add them to storybookBrowserOptimizeDeps in ' +
        'test-helpers/vitest-config/storybook-browser-optimize-deps.mts. ' +
        'This is not a retryable startup flake.\n'
      deps.stderr.write(guidance)
      diagnostics.recordAttempt(guidance)
    }
    deps.writeFileSync(diagnosticsPath, diagnostics.render())
    promoteAttemptCache(cachePlan, deps, result)
    if (result.code === 0) return 0
    if (!result.retryable || attempt === attempts) return result.code
    cachePlan = nextCachePlan({
      attempt,
      attemptEnv,
      cachePlan,
      deps,
      persistentCacheDir,
      result,
    })
    priorHang = result.hung
    deps.stderr.write(
      `[storybook-browser] retrying after retryable Vite/browser failure on attempt ${attempt}\n`,
    )
  }
  return 1
}

function clearResultFiles(deps: StorybookBrowserRunnerDeps) {
  for (const path of resultFiles) deps.rmSync(resolve(deps.cwd, path), { force: true })
}

function storybookBrowserPersistentCacheDir(
  env: NodeJS.ProcessEnv,
  cwd: string,
): string | undefined {
  if (env.STORYBOOK_BROWSER_PERSISTENT_CACHE === '0') return undefined
  if (env.STORYBOOK_BROWSER_PERSISTENT_CACHE_DIR) {
    return resolve(cwd, env.STORYBOOK_BROWSER_PERSISTENT_CACHE_DIR)
  }
  return env.CI ? resolve(cwd, '.cache/vite/storybook-browser') : undefined
}

function initialCachePlan(
  attemptEnv: NodeJS.ProcessEnv,
  persistentCacheDir: string | undefined,
): CachePlan {
  if (persistentCacheDir) {
    return { dir: persistentCacheDir, persistentDir: persistentCacheDir, role: 'persistent' }
  }
  return {
    dir: requiredAttemptCacheDir(attemptEnv),
    persistentDir: persistentCacheDir,
    role: 'attempt',
  }
}

function requiredAttemptCacheDir(attemptEnv: NodeJS.ProcessEnv): string {
  const cacheDir = attemptEnv.VITEST_STORYBOOK_BROWSER_CACHE_DIR
  if (!cacheDir) throw new Error('makeAttemptEnv did not set Vite cache dir for attempt cache')
  return cacheDir
}

function nextCachePlan({
  attempt,
  attemptEnv,
  cachePlan,
  deps,
  persistentCacheDir,
  result,
}: {
  attempt: number
  attemptEnv: NodeJS.ProcessEnv
  cachePlan: CachePlan
  deps: StorybookBrowserRunnerDeps
  persistentCacheDir: string | undefined
  result: AttemptResult
}): CachePlan {
  if (
    !result.optimizerReloadFromNewDeps &&
    (result.isStall ||
      result.runnerMissing ||
      result.viteFetchFailure ||
      (result.hung && !result.viteReady))
  ) {
    if (cachePlan.role === 'persistent') clearPersistentCache(cachePlan.dir, deps)
    return {
      dir: storybookBrowserAttemptCacheDir(attemptEnv, attempt + 1, deps.cwd),
      persistentDir: persistentCacheDir,
      role: 'attempt',
    }
  }
  return cachePlan
}

function clearPersistentCache(cacheDir: string, deps: StorybookBrowserRunnerDeps) {
  deps.stderr.write(
    `[storybook-browser] clearing persistent cache after failed startup: ${cacheDir}\n`,
  )
  deps.rmSync(cacheDir, { force: true, recursive: true })
}

function promoteAttemptCache(
  cachePlan: CachePlan,
  deps: StorybookBrowserRunnerDeps,
  result: AttemptResult,
) {
  if (result.code !== 0 || cachePlan.role !== 'attempt' || !cachePlan.persistentDir) return
  if (!deps.existsSync(resolve(cachePlan.dir, 'deps/_metadata.json'))) {
    deps.stderr.write(
      `[storybook-browser] not promoting attempt cache; optimizer metadata missing in ${cachePlan.dir}\n`,
    )
    return
  }
  deps.rmSync(cachePlan.persistentDir, { force: true, recursive: true })
  deps.mkdirSync(resolve(cachePlan.persistentDir, '..'), { recursive: true })
  deps.cpSync(cachePlan.dir, cachePlan.persistentDir, { recursive: true })
  deps.stderr.write(
    `[storybook-browser] promoted attempt cache ${cachePlan.dir} to persistent cache ${cachePlan.persistentDir}\n`,
  )
}

function formatAttemptResult(attempt: number, result: AttemptResult): string {
  return `${[
    `[storybook-browser] attempt=${attempt} finished in ${result.durationMs}ms`,
    `code=${result.exitCode ?? 'null'}`,
    `signal=${result.signal ?? 'null'}`,
    `resolvedCode=${result.code}`,
    `retryable=${String(result.retryable)}`,
    `stall=${String(result.isStall)}`,
    `hang=${String(result.hung)}`,
    `runnerMissing=${String(result.runnerMissing)}`,
    `budgetExpired=${String(result.budgetExpired)}`,
    `semanticProgress=${String(result.semanticProgress)}`,
    `semanticStall=${String(result.semanticStall)}`,
    `viteReady=${String(result.viteReady)}`,
    `optimizerReadyAtMs=${result.optimizerReadyAtMs ?? 'none'}`,
    `firstTestOutputAtMs=${result.firstTestOutputAtMs ?? 'none'}`,
    `lastOutputAgeMs=${result.lastOutputAgeMs}`,
    `resultFileAtMs=${result.resultFileDetectedAtMs ?? 'none'}`,
    `bootstrapStage=${result.bootstrap.terminalStage}`,
    `bootstrapTimeline=${JSON.stringify(result.bootstrap.timeline)}`,
    `orchestratorDisconnectCount=${result.bootstrap.orchestratorDisconnectCount}`,
    `requestFailureCount=${result.bootstrap.requestFailureCount}`,
    `requestFailureSamples=${JSON.stringify(result.bootstrap.requestFailureSamples)}`,
    `viteFetchFailure=${String(result.viteFetchFailure)}`,
    `optimizerReloadFromNewDeps=${String(result.optimizerReloadFromNewDeps)}`,
    `newOptimizeDeps=${result.newOptimizeDeps.join(',') || 'none'}`,
  ].join('; ')}\n`
}

async function runUpstreamAttempt(
  env: NodeJS.ProcessEnv,
  stallMs: number,
  hangMs: number,
  sessionDeadlineAt: number,
  terminationGraceMs: number,
  diagnostics: StorybookBrowserDiagnostics,
  deps: StorybookBrowserRunnerDeps,
): Promise<AttemptResult> {
  const startedAt = deps.now()
  let optimizerLastProgressAt: number | null = null
  let startupComplete = false
  let anyOutputSeen = false
  let lastOutputAt = startedAt
  let lastHangProgressAt = startedAt
  let retryableViteFailure = false
  let sawNewOptimizeDeps = false
  let sawOptimizerReload = false
  let sawAddonVitestSetupFile = false
  let sawRunnerMissingMessage = false
  let browserSessionConnectionTimedOut = false
  let storybookBrowserOutputSeen = false
  let semanticProgressSeen = false
  let lastSemanticProgressAt = startedAt
  let lastSemanticSequence = 0
  let stalled = false
  let hung = false
  let semanticStall = false
  let firstTestOutputAt: number | null = null
  let optimizerReadyAt: number | null = null
  let resultFileDetectedAt: number | null = null
  let outputBuffer = ''
  let spawnFailed = false
  let completed: AttemptResult | undefined
  const newOptimizeDeps = new Set<string>()
  const bootstrapTelemetry = new StorybookBrowserBootstrapTelemetry()
  const observe = (source: 'stderr' | 'stdout', chunk: string | Buffer) => {
    const now = deps.now()
    const observed = bootstrapTelemetry.consume(source, chunk, now - startedAt)
    if (observed.output) {
      diagnostics.recordOutput(observed.output)
      ;(source === 'stdout' ? deps.stdout : deps.stderr).write(observed.output)
    }
    const text = String(chunk)
    outputBuffer = (outputBuffer + text).slice(-1000)
    const plainOutputBuffer = stripAnsi(outputBuffer)
    anyOutputSeen = true
    lastOutputAt = now
    const storybookOutput = plainOutputBuffer.includes('|web-storybook-browser')
    if (observed.hasNonDiagnosticOutput || storybookBrowserOutputSeen) lastHangProgressAt = now
    if (optimizerProgressPattern.test(text)) optimizerLastProgressAt = now
    const optimizerComplete =
      hasStorybookBrowserViteDependencyReady(plainOutputBuffer) || storybookOutput
    const startupNowComplete = hasStorybookBrowserViteReady(plainOutputBuffer) || storybookOutput
    if (optimizerComplete) optimizerLastProgressAt = null
    if (!startupComplete && startupNowComplete) {
      startupComplete = true
      optimizerReadyAt ??= now
      lastHangProgressAt = now
    }
    const sequence = latestStorybookProgressSequence(plainOutputBuffer)
    if (sequence != null && sequence > lastSemanticSequence) {
      lastSemanticSequence = sequence
      semanticProgressSeen = true
      lastSemanticProgressAt = now
      firstTestOutputAt ??= now
      bootstrapTelemetry.recordSemanticProgress(now - startedAt)
    }
    if (storybookOutput && !storybookBrowserOutputSeen) {
      storybookBrowserOutputSeen = true
      semanticProgressSeen = true
      lastSemanticProgressAt = now
      firstTestOutputAt ??= now
      bootstrapTelemetry.recordSemanticProgress(now - startedAt)
    }
    if (
      startupComplete &&
      !storybookBrowserOutputSeen &&
      browserSessionConnectionTimeoutPattern.test(plainOutputBuffer)
    )
      browserSessionConnectionTimedOut = true
    if (storybookBrowserTestOutputPattern.test(plainOutputBuffer)) firstTestOutputAt ??= now
    if (viteServerFetchFailurePattern.test(plainOutputBuffer)) retryableViteFailure = true
    const plainText = stripAnsi(text)
    if (
      hasStorybookViteNewDependenciesFound(plainText) ||
      hasStorybookViteNewDependenciesFound(plainOutputBuffer)
    )
      sawNewOptimizeDeps = true
    if (
      hasStorybookViteOptimizerReload(plainText) ||
      hasStorybookViteOptimizerReload(plainOutputBuffer)
    )
      sawOptimizerReload = true
    for (const name of parseStorybookViteNewDependencies(plainText)) newOptimizeDeps.add(name)
    if (!sawAddonVitestSetupFile && hasAddonVitestSetupFile(plainText, plainOutputBuffer))
      sawAddonVitestSetupFile = true
    if (
      !sawRunnerMissingMessage &&
      (plainText.includes(vitestRunnerMissingMarker) ||
        plainOutputBuffer.includes(vitestRunnerMissingMarker))
    )
      sawRunnerMissingMessage = true
  }
  const flush = () => {
    for (const [source, stream] of [
      ['stdout', deps.stdout],
      ['stderr', deps.stderr],
    ] as const) {
      const observed = bootstrapTelemetry.flush(source, deps.now() - startedAt)
      if (observed.output) {
        diagnostics.recordOutput(observed.output)
        stream.write(observed.output)
      }
    }
  }
  const nativeDisabledStallTimers = new Set<ReturnType<typeof setTimeout>>()
  const browserDeps: BrowserSessionDeps = {
    clearInterval: deps.clearInterval,
    clearTimeout: handle => {
      const nativeTimer = handle as ReturnType<typeof setTimeout>
      if (nativeDisabledStallTimers.delete(nativeTimer)) clearTimeout(nativeTimer)
      else deps.clearTimeout(handle as ReturnType<typeof setTimeout>)
    },
    isProcessGroupAlive: deps.isProcessGroupAlive,
    killProcessGroup: deps.killProcessGroup,
    now: deps.now,
    offParentSignal: deps.offParentSignal,
    onParentSignal: deps.onParentSignal,
    setInterval: deps.setInterval,
    setTimeout: (callback, ms) => {
      // Couples to vouchington-tooling: its disabled startup/semantic stall sentinels are the
      // only callers that pass max-32-bit ms, and those timers must not hold the process open.
      if (ms !== 2_147_483_647) return deps.setTimeout(callback, ms)
      const timeout = setTimeout(() => {
        nativeDisabledStallTimers.delete(timeout)
        callback()
      }, ms)
      timeout.unref?.()
      nativeDisabledStallTimers.add(timeout)
      return timeout
    },
    waitForProcessGroupExit: deps.waitForProcessGroupExit,
  }
  const remainingMs = Math.max(1, sessionDeadlineAt - terminationGraceMs - deps.now())
  try {
    await runBrowserSession(
      {
        attempts: 1,
        classifyExit: () => (completed?.retryable ? 'retry' : 'return'),
        deadlineMs: remainingMs,
        graceMs: terminationGraceMs,
        onLine: () => undefined,
        onOutput: ({ source, chunk }) => observe(source, chunk),
        onAttemptComplete: session => {
          flush()
          const finishedAt = deps.now()
          const optimizerReloadFromNewDeps = sawNewOptimizeDeps && sawOptimizerReload
          const runnerMissing =
            sawAddonVitestSetupFile && sawRunnerMissingMessage && !storybookBrowserOutputSeen
          const connectionTimeout = browserSessionConnectionTimedOut && !semanticProgressSeen
          const budgetExpired = session.reason === 'deadline'
          completed = {
            budgetExpired,
            code:
              spawnFailed ||
              (session.exit.signal && (stalled || hung || semanticStall || budgetExpired))
                ? 1
                : (session.exit.code ?? 1),
            durationMs: finishedAt - startedAt,
            exitCode: spawnFailed ? 1 : session.exit.code,
            firstTestOutputAtMs: firstTestOutputAt == null ? null : firstTestOutputAt - startedAt,
            hung: hung || connectionTimeout,
            isStall: stalled,
            lastOutputAgeMs: finishedAt - lastOutputAt,
            optimizerReadyAtMs: optimizerReadyAt == null ? null : optimizerReadyAt - startedAt,
            runnerMissing,
            resultFileDetectedAtMs:
              resultFileDetectedAt == null ? null : resultFileDetectedAt - startedAt,
            retryable:
              !spawnFailed &&
              !budgetExpired &&
              !optimizerReloadFromNewDeps &&
              (retryableViteFailure ||
                runnerMissing ||
                (!semanticProgressSeen && (stalled || hung || connectionTimeout))),
            semanticProgress: semanticProgressSeen,
            semanticStall,
            signal: session.exit.signal,
            viteReady: startupComplete,
            bootstrap: bootstrapTelemetry.snapshot(),
            viteFetchFailure: retryableViteFailure,
            optimizerReloadFromNewDeps,
            newOptimizeDeps: [...newOptimizeDeps],
          }
        },
        processGroupDrainMs: terminationGraceMs,
        semanticStallMs: 2_147_483_647,
        start: () => {
          const child = deps.spawn('pnpm', vitestArgs(env), {
            cwd: deps.cwd,
            detached: true,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
          })
          child.on('error', error => {
            spawnFailed = true
            deps.stderr.write(
              `[storybook-browser] failed to start browser test command: ${error.message}\n`,
            )
          })
          const processGroupId = child.pid
          if (!isSpawnedProcessGroupId(processGroupId)) {
            spawnFailed = true
            deps.stderr.write(
              '[storybook-browser] failed to start browser test command: spawned browser test command without a process ID\n',
            )
            throw new Error('spawned browser test command without a process ID')
          }
          return Object.assign(child, { processGroupId })
        },
        startupStallMs: 2_147_483_647,
        watchdog: ({ terminate }) => {
          const interval = deps.setInterval(
            () => {
              const now = deps.now()
              if (deps.existsSync(resolve(deps.cwd, '.vitest-reports/web-storybook-browser.json')))
                resultFileDetectedAt ??= now
              if (
                !semanticProgressSeen &&
                optimizerLastProgressAt != null &&
                now - optimizerLastProgressAt >= stallMs
              ) {
                stalled = true
                deps.stderr.write(
                  `[storybook-browser] Vite optimizer made no startup progress for ${stallMs}ms; terminating attempt\n`,
                )
                terminate()
              } else if (semanticProgressSeen && now - lastSemanticProgressAt >= hangMs) {
                semanticStall = true
                deps.stderr.write(
                  `[storybook-browser] no semantic test progress for ${hangMs}ms; terminating terminal mid-suite stall\n`,
                )
                terminate()
              } else if (
                anyOutputSeen &&
                !semanticProgressSeen &&
                now - lastHangProgressAt >= hangMs
              ) {
                hung = true
                deps.stderr.write(
                  `[storybook-browser] no test output for ${hangMs}ms after Vite startup — suspected Vitest/Chromium tester-connection hang; last output:\n${outputBuffer}\n`,
                )
                terminate()
              }
            },
            Math.min(5000, stallMs),
          )
          return () => deps.clearInterval(interval)
        },
      },
      browserDeps,
    )
  } catch (error) {
    if (!spawnFailed) throw error
    completed = failedSpawnAttempt(startedAt, lastOutputAt, bootstrapTelemetry, deps)
  }
  return (
    completed ?? {
      budgetExpired: true,
      code: 1,
      durationMs: deps.now() - startedAt,
      exitCode: null,
      firstTestOutputAtMs: null,
      hung: false,
      isStall: false,
      lastOutputAgeMs: 0,
      optimizerReadyAtMs: null,
      runnerMissing: false,
      resultFileDetectedAtMs: null,
      retryable: false,
      semanticProgress: false,
      semanticStall: false,
      signal: null,
      viteReady: false,
      bootstrap: bootstrapTelemetry.snapshot(),
      viteFetchFailure: false,
      optimizerReloadFromNewDeps: false,
      newOptimizeDeps: [],
    }
  )
}

function isSpawnedProcessGroupId(processGroupId: number | undefined): processGroupId is number {
  return (
    processGroupId != null &&
    Number.isSafeInteger(processGroupId) &&
    processGroupId > 1 &&
    processGroupId <= 2_147_483_647
  )
}

function failedSpawnAttempt(
  startedAt: number,
  lastOutputAt: number,
  bootstrapTelemetry: StorybookBrowserBootstrapTelemetry,
  deps: StorybookBrowserRunnerDeps,
): AttemptResult {
  return {
    budgetExpired: false,
    code: 1,
    durationMs: deps.now() - startedAt,
    exitCode: 1,
    firstTestOutputAtMs: null,
    hung: false,
    isStall: false,
    lastOutputAgeMs: deps.now() - lastOutputAt,
    optimizerReadyAtMs: null,
    runnerMissing: false,
    resultFileDetectedAtMs: null,
    retryable: false,
    semanticProgress: false,
    semanticStall: false,
    signal: null,
    viteReady: false,
    bootstrap: bootstrapTelemetry.snapshot(),
    viteFetchFailure: false,
    optimizerReloadFromNewDeps: false,
    newOptimizeDeps: [],
  }
}

// The add-on setup-file path (both the `@storybook/addon-vitest` package segment and the
// `vitest-plugin/setup-file.js` file segment) is checked against the current chunk and the
// sliding buffer, so it latches whether the block arrives as one oversized write or is split
// across chunks. The two segments always co-locate on one path line, so requiring both in the
// same haystack never introduces a cross-chunk gap.
function hasAddonVitestSetupFile(plainText: string, plainOutputBuffer: string): boolean {
  const inChunk =
    plainText.includes(addonVitestSetupFilePathMarker) &&
    plainText.includes(addonVitestSetupFileNameMarker)
  const inBuffer =
    plainOutputBuffer.includes(addonVitestSetupFilePathMarker) &&
    plainOutputBuffer.includes(addonVitestSetupFileNameMarker)
  return inChunk || inBuffer
}
