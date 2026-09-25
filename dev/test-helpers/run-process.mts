import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface RunProcessResult {
  code: number | null
  signal: string | null
  timedOut: boolean
  errno: string | undefined
  durationMs: number
  stdout: string
  stderr: string
}

interface ExecFileError {
  code?: number | string
  signal?: string | null
  killed?: boolean
  stdout?: string
  stderr?: string
}

/**
 * Runs a child process and maps its outcome (exit code, signal, spawn
 * errno, timeout) instead of collapsing every failure into a single
 * generic exit code. There is no default timeout: a caller that wants one
 * opts in with `timeoutMs`, chosen with headroom under its own project's
 * `testTimeout` (see `RUN_TMUX_TIMEOUT_MS` in `run-tmux.mts` for the
 * pattern) - see docs/development/reference-tests-vitest-projects.md.
 */
export async function runProcess(
  file: string,
  args: string[],
  {
    cwd,
    env,
    timeoutMs,
  }: {
    cwd?: string
    env?: NodeJS.ProcessEnv
    timeoutMs?: number
  } = {},
): Promise<RunProcessResult> {
  const start = performance.now()
  let code: number | null = 0
  let signal: string | null = null
  let timedOut = false
  let errno: string | undefined
  let stdout = ''
  let stderr = ''
  try {
    ;({ stdout, stderr } = await execFileAsync(file, args, {
      cwd,
      env,
      timeout: timeoutMs,
    }))
  } catch (error) {
    const result = error as ExecFileError
    code = typeof result.code === 'number' ? result.code : null
    errno = typeof result.code === 'string' ? result.code : undefined
    signal = result.signal ?? null
    timedOut = result.killed === true
    stdout = result.stdout ?? ''
    stderr = result.stderr ?? ''
  }
  return {
    code,
    durationMs: Math.round(performance.now() - start),
    errno,
    signal,
    stderr,
    stdout,
    timedOut,
  }
}
