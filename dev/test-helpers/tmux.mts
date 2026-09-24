import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { trackTmuxTestDir } from './tmux-fake-bin.mts'
export { runTmux } from './run-tmux.mts'
export { registerTmuxFakeHooks } from './tmux-fake-bin.mts'
export type { MakeFakeBinOptions } from './tmux-fake-bin.mts'

const sourceTmuxPath = fileURLToPath(new URL('../tmux', import.meta.url))
const sourceGitWorktreesPath = fileURLToPath(
  new URL(
    '../../node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh',
    import.meta.url,
  ),
)

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
  trackTmuxTestDir(fixedBasename ? dirname(dir) : dir)
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
