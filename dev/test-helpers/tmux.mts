import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { workerQueuePolicy } from '../../backend/modules/worker-queue-inventory/worker-queue-policy.mts'
export { runTmux } from './run-tmux.mts'

const sourceTmuxPath = fileURLToPath(new URL('../tmux', import.meta.url))
const fakeTmuxPath = fileURLToPath(new URL('./fake-tmux.sh', import.meta.url))
const fakePgrepPath = fileURLToPath(new URL('./fake-pgrep.sh', import.meta.url))
const sourceGitWorktreesPath = fileURLToPath(
  new URL(
    '../../node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh',
    import.meta.url,
  ),
)
const testDirs: string[] = []
const defaultQueues = [
  ...workerQueuePolicy.cpuOnlyQueues,
  ...workerQueuePolicy.ioCapableQueues,
].join(',')

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
    await writeExecutable(dir, 'tmux', await readFile(fakeTmuxPath, 'utf8'))
    await writeExecutable(dir, 'pgrep', await readFile(fakePgrepPath, 'utf8'))
  }
  await writeExecutable(dir, 'basename', '#!/bin/bash\nexec /usr/bin/basename "$@"\n')
  await writeExecutable(dir, 'dirname', '#!/bin/bash\nexec /usr/bin/dirname "$@"\n')
  await writeExecutable(
    dir,
    'docker',
    '#!/bin/bash\nprintf "docker %s\\n" "$*" >> "${FAKE_TMUX_LOG:?}"\nif [ "$1" = ps ]; then exit 0; fi\n',
  )
  await writeExecutable(dir, 'openssl', '#!/bin/bash\nexec /usr/bin/openssl "$@"\n')
  await writeExecutable(dir, 'grep', '#!/bin/bash\nexec /usr/bin/grep "$@"\n')
  await writeExecutable(dir, 'tr', '#!/bin/bash\nexec /usr/bin/tr "$@"\n')
  await writeExecutable(dir, 'sleep', '#!/bin/bash\nexec /bin/sleep "$@"\n')
  await writeExecutable(dir, 'bash', '#!/bin/bash\nexec /bin/bash --noprofile --norc "$@"\n')
  await writeExecutable(
    dir,
    'node',
    `#!/bin/bash
printf '%s\n' "$*" >> "\${FAKE_NODE_LOG:?}"
[[ "$*" == *"dev/localization/local-catalog.mts"* ]] && { printf '%s\n' "$(pwd)/.local/localization/catalog.sqlite"; exit 0; }
case "\${2:-}" in
  dev-all-queues)
    printf '%s\n' '${defaultQueues}'
    ;;
  *)
    printf 'node\n' >> "\${FAKE_EXEC_LOG:?}"; for arg in "$@"; do printf 'node-arg\t%s\n' "$arg" >> "\${FAKE_NODE_ARG_LOG:?}"; done
    printf 'node-env\tIMAGE_LAMBDA_PORT=%s\n' "\${IMAGE_LAMBDA_PORT:-}" >> "\${FAKE_NODE_ARG_LOG:?}"; printf 'node-env\tLOCALIZATION_SQLITE_PATH=%s\n' "\${LOCALIZATION_SQLITE_PATH:-}" >> "\${FAKE_NODE_ARG_LOG:?}"
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
  fixedBasename = false,
  shellSensitiveParent = false,
}: {
  certs?: boolean
  envAppend?: string
  fixedBasename?: boolean
  shellSensitiveParent?: boolean
} = {}) {
  const parent = shellSensitiveParent ? join(tmpdir(), "voucha tmux parent's repos") : tmpdir()
  await mkdir(parent, { recursive: true })
  const dir = fixedBasename
    ? join(await mkdtemp(join(parent, 'voucha-tmux-parent-')), 'project')
    : await mkdtemp(join(parent, 'voucha-tmux-repo-'))
  testDirs.push(fixedBasename ? dirname(dir) : dir)
  await mkdir(join(dir, 'dev'), { recursive: true })
  await mkdir(join(dir, 'dev', 'lib'), { recursive: true })
  await mkdir(join(dir, 'web'), { recursive: true })
  await mkdir(join(dir, 'cloudflare-worker'), { recursive: true })
  if (certs) {
    await mkdir(join(dir, 'dev', 'certs'), { recursive: true })
    await writeFile(join(dir, 'dev', 'certs', 'localhost.pem'), '')
    await writeFile(join(dir, 'dev', 'certs', 'localhost-key.pem'), '')
  }
  await writeFile(join(dir, 'dev', 'tmux'), await readFile(sourceTmuxPath, 'utf8'))
  await writeFile(
    join(dir, 'dev', 'lib', 'git-worktrees.sh'),
    await readFile(sourceGitWorktreesPath, 'utf8'),
  )
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
  await writeFile(join(dir, '.initialized'), 'web\n')
  return dir
}

export async function cleanupTmuxTestDirs() {
  await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
}
