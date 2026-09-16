import { formatTeardownOverrunDiagnostics } from '../test-helpers/vitest-teardown-overrun-diagnostics.mts'

/** Root vitest.config.mts teardownTimeout. */
export const TOOLING_TEARDOWN_TIMEOUT_MS = 20_000
export const TOOLING_HANG_GRACE_MS = 10_000
/** Well under tests-tooling.yml's 16-minute step. Local runs omit this cap. */
export const TOOLING_HANG_WALL_CLOCK_MS = 12 * 60_000
const PENDING_LIMIT = 512

export const WORKER_TERMINATE_PATTERN = /Timeout terminating (?:threads|forks) worker/
export const VITEST_RUN_SUMMARY_PATTERN = /Test Files\s/

export type ToolingHangOutputStream = 'stderr' | 'stdout'

export type ToolingHangWatchdogState = {
  coverageEnabled: boolean
  lastOutputAt: number
  pendingByStream: { stderr: string; stdout: string }
  sawRunSummary: boolean
  startedAt: number
  terminateWorkerAt: number | null
  wallClock: boolean
}

export type ToolingHangWatchdogDeps = {
  clearInterval: (handle: unknown) => void
  killProcessGroup: (pid: number, signal: NodeJS.Signals) => void
  now: () => number
  setInterval: (callback: () => void, ms: number) => unknown
  stderr: Pick<NodeJS.WriteStream, 'write'>
}

export type ToolingHangWatchdogOptions = {
  coverageEnabled?: boolean
  wallClock?: boolean
}

export function shouldKillToolingHang(state: ToolingHangWatchdogState, now: number): boolean {
  if (state.wallClock && now - state.startedAt >= TOOLING_HANG_WALL_CLOCK_MS) return true
  if (state.terminateWorkerAt !== null && now - state.terminateWorkerAt >= TOOLING_HANG_GRACE_MS) {
    return true
  }
  if (state.coverageEnabled) return false
  return (
    state.sawRunSummary &&
    now - state.lastOutputAt >= TOOLING_TEARDOWN_TIMEOUT_MS + TOOLING_HANG_GRACE_MS
  )
}

export function recordToolingHangOutput(
  state: ToolingHangWatchdogState,
  chunk: string,
  now: number,
  stream: ToolingHangOutputStream,
): ToolingHangWatchdogState {
  const combined = `${state.pendingByStream[stream]}${chunk}`
  const lastNl = combined.lastIndexOf('\n')
  const complete = lastNl === -1 ? '' : combined.slice(0, lastNl + 1)
  const pending = (lastNl === -1 ? combined : combined.slice(lastNl + 1)).slice(-PENDING_LIMIT)
  return {
    ...state,
    lastOutputAt: now,
    pendingByStream: { ...state.pendingByStream, [stream]: pending },
    sawRunSummary: state.sawRunSummary || VITEST_RUN_SUMMARY_PATTERN.test(complete),
    terminateWorkerAt:
      state.terminateWorkerAt ?? (WORKER_TERMINATE_PATTERN.test(complete) ? now : null),
  }
}

export function startToolingHangWatchdog(
  pid: number,
  deps: ToolingHangWatchdogDeps,
  options: ToolingHangWatchdogOptions = {},
): {
  onOutput: (chunk: string, stream: ToolingHangOutputStream) => void
  stop: () => void
} {
  let state: ToolingHangWatchdogState = {
    coverageEnabled: options.coverageEnabled === true,
    lastOutputAt: deps.now(),
    pendingByStream: { stderr: '', stdout: '' },
    sawRunSummary: false,
    startedAt: deps.now(),
    terminateWorkerAt: null,
    wallClock: options.wallClock === true,
  }
  let killed = false
  const timer = deps.setInterval(() => {
    if (killed || !shouldKillToolingHang(state, deps.now())) return
    killed = true
    deps.stderr.write(formatTeardownOverrunDiagnostics())
    deps.killProcessGroup(pid, 'SIGKILL')
  }, 1000)
  return {
    onOutput: (chunk, stream) => {
      state = recordToolingHangOutput(state, chunk, deps.now(), stream)
    },
    stop: () => deps.clearInterval(timer),
  }
}
