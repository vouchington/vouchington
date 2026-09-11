import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { serviceExitMessage, watchForPostReadyExit } from './exit-diagnostics.mts'
import { isHealthy, waitFor } from './wait.mts'

export interface ManagedProcessExit {
  code: number | null
  error?: Error
  signal: NodeJS.Signals | null
}

export interface ManagedProcess {
  exited: Promise<ManagedProcessExit>
  exitStatus: () => ManagedProcessExit | null
  logPath: string
  stop: () => Promise<void>
  wasStopRequested: () => boolean
}

export function startManagedProcess(options: {
  name: string
  command: string
  args: string[]
  cwd: string
  env?: NodeJS.ProcessEnv
  logFilePrefix: string
}): ManagedProcess {
  const serviceLogsDir = join(process.cwd(), 'integration-tests/web/artifacts/service-logs')
  mkdirSync(serviceLogsDir, { recursive: true })
  const logPath = join(serviceLogsDir, `${options.logFilePrefix}.log`)
  let exitStatus: ManagedProcessExit | null = null
  let exitedSettled = false
  let logStreamEnded = false
  let stopRequested = false
  let resolveExited!: (exit: ManagedProcessExit) => void
  let resolveClosed!: () => void
  const exited = new Promise<ManagedProcessExit>(resolve => {
    resolveExited = resolve
  })
  const closed = new Promise<void>(resolve => {
    resolveClosed = resolve
  })
  const logStream = createWriteStream(logPath, { flags: 'a' })

  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own process group, so stopChild()'s SIGKILL fallback can target the whole tree.
    detached: true,
  })

  child.stdout?.on('data', chunk => {
    logStream.write(chunk)
    process.stdout.write(`[${options.logFilePrefix}] ${chunk}`)
  })

  child.stderr?.on('data', chunk => {
    logStream.write(chunk)
    process.stderr.write(`[${options.logFilePrefix}] ${chunk}`)
  })

  function finishLogStream(): void {
    if (!logStreamEnded) {
      logStreamEnded = true
      logStream.end(resolveClosed)
    }
  }

  function settleExited(exit: ManagedProcessExit, message?: string, endLog: boolean = false): void {
    if (exitedSettled) {
      return
    }

    exitedSettled = true
    exitStatus = exit
    const resolve = async (): Promise<void> => {
      if (endLog) {
        finishLogStream()
      }
      await closed
      resolveExited(exit)
    }
    if (message) {
      process.stderr.write(message)
      logStream.write(message, () => {
        void resolve()
      })
      return
    }
    void resolve()
  }

  child.once('error', error => {
    settleExited(
      { code: null, error, signal: null },
      `[${options.logFilePrefix}] failed to start: ${error.message}\n`,
      true,
    )
  })

  child.once('exit', (code, signal) => {
    if (code !== null && code !== 0 && !child.killed) {
      settleExited({ code, signal }, `[${options.logFilePrefix}] exited with code ${code}\n`)
      return
    }

    settleExited({ code, signal })
  })
  child.once('close', () => {
    finishLogStream()
  })

  return {
    exited,
    exitStatus: () => exitStatus,
    logPath,
    stop: async () => {
      // Only claim the exit if the process was still alive at call time — a
      // pre-existing crash's `exited` may not have settled yet (async log flush).
      if (exitStatus === null) {
        stopRequested = true
        await stopChild(child)
      }
      await exited
    },
    wasStopRequested: () => stopRequested,
  }
}

export async function waitForService(
  name: string,
  url: string,
  validStatuses: number[] = [200],
  managedProcess?: ManagedProcess,
): Promise<void> {
  if (!managedProcess) {
    await waitFor(name, signal => isHealthy(url, validStatuses, signal), 120_000)
    return
  }

  const controller = new AbortController()
  const ready = waitFor(
    name,
    signal => isHealthy(url, validStatuses, signal),
    120_000,
    500,
    controller.signal,
  )
  let active = true
  try {
    await Promise.race([
      ready,
      managedProcess.exited.then(exit => {
        if (active) {
          throw new Error(serviceExitMessage(name, url, managedProcess.logPath, exit))
        }
        return undefined
      }),
    ])
  } finally {
    active = false
    controller.abort()
  }

  // The startup race above only guards readiness; arm a separate post-ready watcher
  // (see exit-diagnostics.mts) so a later crash reports a clear marker instead of
  // surfacing only as unrelated test failures.
  watchForPostReadyExit(name, managedProcess)
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return

  child.kill('SIGTERM')
  await new Promise<void>(resolve => {
    const forceKillTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
        // SIGKILL can't be forwarded, so target the whole group or grandchildren
        // (e.g. start.mts's wrangler/workerd) would be orphaned.
        try {
          // oxlint-disable-next-line no-restricted-properties -- terminates the detached managed process group
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          child.kill('SIGKILL')
        }
      }
    }, 5_000)

    child.once('exit', () => {
      clearTimeout(forceKillTimer)
      // `once` invokes this resolver callback at most once
      resolve()
    })
  })
}
