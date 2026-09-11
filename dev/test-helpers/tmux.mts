import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  devWorkerCpuQueues,
  devWorkerIoQueues,
  workerQueuePolicy,
} from '../../backend/modules/worker-queue-inventory/worker-queue-policy.mts'

const execFileAsync = promisify(execFile)
const sourceTmuxPath = fileURLToPath(new URL('../tmux', import.meta.url))
const testDirs: string[] = []
const defaultCpuQueues = devWorkerCpuQueues().join(',')
const defaultIoQueues = devWorkerIoQueues().join(',')
const allIoQueuesExcluded = workerQueuePolicy.ioCapableQueues
  .map(queueName => `-${queueName}`)
  .join(',')

async function writeExecutable(dir: string, name: string, contents: string) {
  await writeFile(join(dir, name), contents)
  await chmod(join(dir, name), 0o755)
}

async function writeLoggingExecutable(dir: string, name: string) {
  await writeExecutable(dir, name, `#!/bin/bash\nprintf '${name}\\n' >> "\${FAKE_EXEC_LOG:?}"\n`)
}
export async function makeFakeBin({
  tmux = true,
  codex = true,
  claude = true,
  cursor = false,
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-tmux-bin-'))
  testDirs.push(dir)

  if (tmux) {
    await writeExecutable(
      dir,
      'tmux',
      `#!/bin/bash
log="\${FAKE_TMUX_LOG:?}"
printf '%s\n' "$*" >> "$log"
if [ "$1" = "has-session" ]; then exit "\${FAKE_TMUX_HAS_SESSION_EXIT:-1}"; fi
if [ "$1" = "display-message" ]; then printf 'voucha-test\n'; fi
if [ "\${FAKE_TMUX_EXECUTE_COMMANDS:-}" = "1" ] && { [ "$1" = "new-session" ] || [ "$1" = "new-window" ]; }; then
  shift
  pane_name=''; pane_cwd=''; pane_command=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -c) pane_cwd="$2"; shift 2 ;;
      -n) pane_name="$2"; shift 2 ;;
      -s|-t) shift 2 ;;
      -d) shift ;;
      *) pane_command="$1"; shift ;;
    esac
  done
  if [ -n "$pane_command" ]; then
    printf '\n' | (cd "\${pane_cwd:-.}" && /bin/sh -c "$pane_command")
    printf '%s\t%s\n' "$pane_name" "$?" >> "\${FAKE_TMUX_STATUS_LOG:?}"
  fi
  exit 0
fi
`,
    )
  }
  await writeExecutable(dir, 'basename', '#!/bin/bash\nexec /usr/bin/basename "$@"\n')
  await writeExecutable(dir, 'dirname', '#!/bin/bash\nexec /usr/bin/dirname "$@"\n')
  await writeExecutable(dir, 'bash', '#!/bin/bash\nexec /bin/bash --noprofile --norc "$@"\n')
  await writeExecutable(
    dir,
    'node',
    `#!/bin/bash
printf '%s\n' "$*" >> "\${FAKE_NODE_LOG:?}"
case "\${2:-}" in
  dev-cpu-queues)
    printf '%s' '${defaultCpuQueues}'
    if [ -n "\${WORKER_CPU_EXTRA_QUEUES:-}" ]; then printf ',%s' "$WORKER_CPU_EXTRA_QUEUES"; fi
    printf '\n'
    ;;
  dev-io-queues)
    if [ -n "\${WORKER_CPU_EXTRA_QUEUES:-}" ]; then
      printf '%s\n' '${allIoQueuesExcluded}'
    else
      printf '%s\n' '${defaultIoQueues}'
    fi
    ;;
  *)
    printf 'node\n' >> "\${FAKE_EXEC_LOG:?}"
    for arg in "$@"; do printf 'node-arg\t%s\n' "$arg" >> "\${FAKE_NODE_ARG_LOG:?}"; done
    printf 'node-env\tIMAGE_LAMBDA_PORT=%s\n' "\${IMAGE_LAMBDA_PORT:-}" >> "\${FAKE_NODE_ARG_LOG:?}"
    ;;
esac
`,
  )
  if (claude) await writeLoggingExecutable(dir, 'claude')
  if (codex) await writeLoggingExecutable(dir, 'codex')
  if (cursor) await writeLoggingExecutable(dir, 'cursor-agent')
  await writeLoggingExecutable(dir, 'pnpm')
  return dir
}
export async function makeRepo({
  certs = false,
  envAppend = '',
  shellSensitiveParent = false,
}: { certs?: boolean; envAppend?: string; shellSensitiveParent?: boolean } = {}) {
  const parent = shellSensitiveParent ? join(tmpdir(), "voucha tmux parent's repos") : tmpdir()
  await mkdir(parent, { recursive: true })
  const dir = await mkdtemp(join(parent, 'voucha-tmux-repo-'))
  testDirs.push(dir)
  await mkdir(join(dir, 'dev'), { recursive: true })
  await mkdir(join(dir, 'web'), { recursive: true })
  await mkdir(join(dir, 'cloudflare-worker'), { recursive: true })
  if (certs) {
    await mkdir(join(dir, 'dev', 'certs'), { recursive: true })
    await writeFile(join(dir, 'dev', 'certs', 'localhost.pem'), '')
    await writeFile(join(dir, 'dev', 'certs', 'localhost-key.pem'), '')
  }
  await writeFile(join(dir, 'dev', 'tmux'), await readFile(sourceTmuxPath, 'utf8'))
  await chmod(join(dir, 'dev', 'tmux'), 0o755)
  await writeFile(
    join(dir, '.env'),
    `export PORT=3900
export NEXT_PORT=3901
export WORKER_PORT=3902
export IMAGE_LAMBDA_PORT=3903
export LIGHTPANDA_CDP_URL=wss://uswest.cloud.lightpanda.io/ws
${envAppend}`,
  )
  return dir
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

export async function cleanupTmuxTestDirs() {
  await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
}
