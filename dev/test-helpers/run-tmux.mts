import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { toolingTestBudget } from '../../test-helpers/vitest-config/tooling-projects.mts'

const execFileAsync = promisify(execFile)

// dev-tools tests get toolingTestBudget.testTimeout (30s) to run setup, invoke dev/tmux,
// and assert. Bounding each dev/tmux invocation to a third of that budget keeps the harness
// bound strictly below the test's own timeout - including for a test that makes two
// sequential runTmux calls - and reports a real hang as a timedOut result instead of the
// outer Vitest timeout firing first and masking which layer failed.
export const RUN_TMUX_TIMEOUT_MS = Math.floor(toolingTestBudget.testTimeout / 3)

export interface RunTmuxResult {
  code: number | null
  signal: string | null
  timedOut: boolean
  errno: string | undefined
  durationMs: number
  stdout: string
  stderr: string
  execLog: string
  log: string
  nodeArgLog: string
  nodeLog: string
  statusLog: string
}

interface ExecFileError {
  code?: number | string
  signal?: string | null
  killed?: boolean
  stdout?: string
  stderr?: string
}

async function readLog(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

export async function runTmux({
  binDir,
  cwd,
  tmuxEnv,
  args = [],
  extraEnv = {},
  timeoutMs = RUN_TMUX_TIMEOUT_MS,
}: {
  binDir: string
  cwd: string
  tmuxEnv?: string
  args?: string[]
  extraEnv?: Record<string, string>
  timeoutMs?: number
}): Promise<RunTmuxResult> {
  const paths = {
    execLog: join(cwd, 'exec.log'),
    log: join(cwd, 'tmux.log'),
    nodeArgLog: join(cwd, 'node-args.log'),
    nodeLog: join(cwd, 'node.log'),
    statusLog: join(cwd, 'tmux-status.log'),
  }
  const { TMUX: _processTmux, ...processEnvWithoutTmux } = process.env
  const { TMUX: _extraTmux, ...extraEnvWithoutTmux } = extraEnv
  const env: Record<string, string | undefined> = {
    ...processEnvWithoutTmux,
    FAKE_EXEC_LOG: paths.execLog,
    FAKE_NODE_ARG_LOG: paths.nodeArgLog,
    FAKE_NODE_LOG: paths.nodeLog,
    FAKE_TMUX_LOG: paths.log,
    FAKE_TMUX_STATUS_LOG: paths.statusLog,
    PATH: binDir,
    VALKEY_CONTAINER: undefined,
    ...extraEnvWithoutTmux,
    ...(tmuxEnv === undefined ? {} : { TMUX: tmuxEnv }),
  }

  const start = performance.now()
  let code: number | null = 0
  let signal: string | null = null
  let timedOut = false
  let errno: string | undefined
  let stderr = ''
  let stdout = ''
  try {
    ;({ stderr, stdout } = await execFileAsync('/bin/bash', [join(cwd, 'dev', 'tmux'), ...args], {
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
  const durationMs = Math.round(performance.now() - start)
  const [execLog, log, nodeArgLog, nodeLog, statusLog] = await Promise.all(
    Object.values(paths).map(readLog),
  )
  return {
    code,
    durationMs,
    errno,
    execLog,
    log,
    nodeArgLog,
    nodeLog,
    signal,
    statusLog,
    stderr,
    stdout,
    timedOut,
  }
}
