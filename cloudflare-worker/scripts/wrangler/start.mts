#!/usr/bin/env node

import { type ChildProcessByStdio, spawn } from 'node:child_process'
import type { Readable } from 'node:stream'
import {
  appendWranglerReadySearchText,
  createWranglerStderrConsoleFilterState,
  filterWranglerStderrConsoleLines,
  stripAnsi,
} from './config.mts'
import { clearStaleWranglerCaches } from './cache-cleanup.mts'
import { loadStartWranglerEnv } from './env.mts'
import {
  createWranglerLogStreams,
  flushLogs,
  isCosmetic,
  prefixLines,
  type WranglerEventExtra,
  writeWranglerEvent,
} from './logging.mts'
import {
  MAX_RESTARTS,
  STABLE_UPTIME_MS,
  burstAttemptNumber,
  formatWranglerRestartMessage,
} from './restart-policy.mts'
import { ensureWranglerRuntimeDirs } from './runtime.mts'

const startEnv = loadStartWranglerEnv()
const {
  args,
  logLevel: WRANGLER_EFFECTIVE_LOG_LEVEL,
  persistTo: WRANGLER_PERSIST_TO,
} = startEnv.wranglerArgs
const HAS_CERTS = startEnv.hasCerts
const INSPECTOR_PORT = startEnv.inspectorPort
const IS_CI = startEnv.isCi
const WORKER_DIR = startEnv.workerDir
const WRANGLER_ENV = startEnv.wranglerEnv
const WORKER_LOG_DIR = startEnv.workerLogDir
const WORKER_PORT = startEnv.workerPort
const WORKERD_VERSION = startEnv.workerdVersion
const WRANGLER_BIN = startEnv.wranglerBin
const WRANGLER_RUNTIME_PATHS = startEnv.wranglerRuntimePaths
const WRANGLER_VERSION = startEnv.wranglerVersion

const logStreams = createWranglerLogStreams(WORKER_LOG_DIR)

// wrangler dev can crash mid-suite: workerd "Broken pipe"/"Connection reset by peer" on a
// mid-request client disconnect, or (#10819) an upstream ProxyController bug that mistakes a
// non-fatal ProxyWorker error for a fatal one. Auto-restart recovers transparently -- the new
// process binds the same port. restartCount is a burst-relative budget (restart-policy.mts), not a
// lifetime cap: an attempt that stays up past STABLE_UPTIME_MS clears it.
let restartCount = 0
let shuttingDown = false
// stdio is ['ignore', 'pipe', 'pipe'] below, so stdin is null — ChildProcessWithoutNullStreams
// (which requires a non-null stdin) does not match the real spawn() return type.
let child: ChildProcessByStdio<null, Readable, Readable>
const stderrConsoleFilterState = createWranglerStderrConsoleFilterState()

function writeWranglerStderrToConsole(text: string, options: { flush?: boolean } = {}): void {
  for (const line of filterWranglerStderrConsoleLines(stderrConsoleFilterState, text, options)) {
    if (!isCosmetic(stripAnsi(line))) {
      process.stderr.write(`[wrangler] ${line}\n`)
    }
  }
}

function writeEvent(event: string, extra: WranglerEventExtra = {}): void {
  writeWranglerEvent({
    context: {
      hasCerts: HAS_CERTS,
      inspectorPort: INSPECTOR_PORT,
      isCi: IS_CI,
      logLevel: WRANGLER_EFFECTIVE_LOG_LEVEL,
      persistTo: WRANGLER_PERSIST_TO,
      workerPort: WORKER_PORT,
      workerdVersion: WORKERD_VERSION,
      wranglerVersion: WRANGLER_VERSION,
    },
    event,
    extra,
    restartCount,
    streams: logStreams,
  })
}

function spawnWrangler() {
  const attemptStartedAt = Date.now()
  let readyLogged = false
  let readySearchText = ''
  let spawnFailed = false
  writeEvent('start')
  process.stderr.write(
    `[${new Date().toISOString()}] start-wrangler: starting wrangler dev on port ${WORKER_PORT} (CI=${IS_CI}, HTTPS=${HAS_CERTS}, wrangler=${WRANGLER_VERSION}, workerd=${WORKERD_VERSION}, logLevel=${WRANGLER_EFFECTIVE_LOG_LEVEL}, persistTo=${WRANGLER_PERSIST_TO ?? 'none'})\n`,
  )

  const wrangler = spawn(WRANGLER_BIN, args, {
    cwd: WORKER_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: WRANGLER_ENV,
  })

  wrangler.stdout.on('data', (data: Buffer) => {
    process.stdout.write(data)
    const text = data.toString()
    logStreams.stdoutLog?.write(prefixLines(text, `[${new Date().toISOString()}]`))
    const readySearch = appendWranglerReadySearchText(readySearchText, text)
    readySearchText = readySearch.searchText
    if (!readyLogged && readySearch.isReady) {
      readyLogged = true
      writeEvent('ready', { readyMs: Date.now() - attemptStartedAt })
    }
  })

  wrangler.stderr.on('data', (data: Buffer) => {
    const text = data.toString()
    logStreams.stderrLog?.write(prefixLines(text, `[${new Date().toISOString()}]`))
    writeWranglerStderrToConsole(text)
  })

  wrangler.on('error', async (err: Error) => {
    spawnFailed = true
    const msg = `[${new Date().toISOString()}] start-wrangler: failed to spawn wrangler: ${err.message}\n`
    process.stderr.write(msg)
    logStreams.stderrLog?.write(msg)
    writeEvent('spawn-error', { elapsedMs: Date.now() - attemptStartedAt, message: err.message })
    await flushLogs(logStreams)
    process.exit(1)
  })

  wrangler.on('close', async (code: number | null, signal: NodeJS.Signals | null) => {
    if (spawnFailed) return

    writeWranglerStderrToConsole('', { flush: true })
    const uptimeMs = Date.now() - attemptStartedAt
    const msg = `[${new Date().toISOString()}] start-wrangler: wrangler exited (code=${code}, signal=${signal})\n`
    process.stderr.write(msg)
    logStreams.stderrLog?.write(msg)
    writeEvent('exit', { code, elapsedMs: uptimeMs, signal })

    // Restart on unexpected crashes, not intentional shutdown (SIGTERM/SIGINT) or a signal-killed
    // child (signal !== null means an OS-level kill bypassed shuttingDown, e.g. external SIGTERM).
    // The burst-relative attempt is computed *before* the budget check -- see restart-policy.mts.
    const nextAttempt = burstAttemptNumber(restartCount, uptimeMs, STABLE_UPTIME_MS)
    if (!shuttingDown && signal === null && code !== 0 && nextAttempt <= MAX_RESTARTS) {
      restartCount = nextAttempt
      writeEvent('restart-scheduled', { code, signal, uptimeMs })
      process.stderr.write(
        `[${new Date().toISOString()}] ${formatWranglerRestartMessage(restartCount, MAX_RESTARTS)}\n`,
      )
      // Brief delay to let the OS fully release the port before rebinding.
      // 100ms is enough for the kernel to clean up the socket; the original
      // 500ms was unnecessarily long. Without any delay, a tight restart loop
      // could exhaust MAX_RESTARTS in milliseconds if the port is momentarily
      // unavailable. Guard against a shutdown signal during the delay.
      setTimeout(() => {
        if (!shuttingDown) {
          child = spawnWrangler()
        }
      }, 100)
      return
    }

    await flushLogs(logStreams)
    process.exit(shuttingDown ? 0 : (code ?? 1))
  })

  return wrangler
}

clearStaleWranglerCaches({
  isCi: IS_CI,
  log: message => process.stderr.write(`${message}\n`),
  persistTo: WRANGLER_PERSIST_TO,
  runtimePaths: WRANGLER_RUNTIME_PATHS,
  workerDir: WORKER_DIR,
})
ensureWranglerRuntimeDirs(WRANGLER_RUNTIME_PATHS)
child = spawnWrangler()

function forwardSignalToWrangler(sig: 'SIGTERM' | 'SIGINT'): () => void {
  return () => {
    shuttingDown = true
    process.stderr.write(
      `[${new Date().toISOString()}] start-wrangler: received ${sig}, forwarding to wrangler\n`,
    )
    child.kill(sig)
  }
}

// Forward signals to wrangler for clean shutdown. Registered after `child` is
// initialized to avoid the Temporal Dead Zone — and after restarts, `child` is
// reassigned so these handlers always kill the live process.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, forwardSignalToWrangler(sig))
}
