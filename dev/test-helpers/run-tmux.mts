import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

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
}: {
  binDir: string
  cwd: string
  tmuxEnv?: string
  args?: string[]
  extraEnv?: Record<string, string>
}) {
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

  let exitCode = 0
  let stderr = ''
  let stdout = ''
  try {
    ;({ stderr, stdout } = await execFileAsync('/bin/bash', [join(cwd, 'dev', 'tmux'), ...args], {
      cwd,
      env,
      timeout: 10_000,
    }))
  } catch (error: unknown) {
    const result = error as { code?: number; stderr?: string; stdout?: string }
    exitCode = typeof result.code === 'number' ? result.code : 1
    ;({ stderr = '', stdout = '' } = result)
  }
  const [execLog, log, nodeArgLog, nodeLog, statusLog] = await Promise.all(
    Object.values(paths).map(readLog),
  )
  return { execLog, exitCode, log, nodeArgLog, nodeLog, statusLog, stderr, stdout }
}
