import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const devDir = fileURLToPath(new URL('..', import.meta.url))
const toolingWorktreeDir = join(devDir, '../node_modules/vouchington-tooling/scripts/worktree')
const testDirs: string[] = []

const generatedPaths = ['dist', 'web/.next', 'coverage', 'test-report.junit.xml']
const gitEnv = {
  GIT_AUTHOR_EMAIL: 'tests+reset@voucha.ai',
  GIT_AUTHOR_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'tests+reset@voucha.ai',
  GIT_COMMITTER_NAME: 'Test',
}

async function git(cwd: string, ...args: string[]) {
  return (await execFileAsync('git', args, { cwd, env: { ...process.env, ...gitEnv } })).stdout
}

async function exists(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  )
}

async function writeStub(root: string, name: string, body: string) {
  const path = join(root, 'dev', name)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `#!/usr/bin/env bash\n${body}\n`)
  await chmod(path, 0o755)
}

async function makeCheckout() {
  const root = await mkdtemp(join(tmpdir(), 'voucha-reset-worktree-'))
  testDirs.push(root)
  const origin = join(root, 'origin.git')
  const seed = join(root, 'seed')
  await git(root, 'init', '--bare', '-b', 'main', origin)
  await mkdir(seed)
  await git(seed, 'init', '-b', 'main')
  await writeFile(
    join(seed, '.gitignore'),
    ['.env', '.valkey-port', '.local/', 'node_modules/', ...generatedPaths, ''].join('\n'),
  )
  for (const file of ['reset-worktree', 'lib/reset-worktree-hooks.sh']) {
    await mkdir(dirname(join(seed, 'dev', file)), { recursive: true })
    await cp(join(devDir, file), join(seed, 'dev', file))
  }
  for (const file of ['refuse-on-main.sh', 'worktree-resource-env.sh', 'db-name-from-url.sh']) {
    await cp(join(devDir, 'lib', file), join(seed, 'dev/lib', file))
  }
  await chmod(join(seed, 'dev/reset-worktree'), 0o755)
  const commandLog = join(root, 'commands.log')
  await writeStub(seed, 'teardown', `printf 'teardown %s\\n' "$*" >> '${commandLog}'`)
  await writeStub(seed, 'initialize', `printf 'initialize %s\\n' "$*" >> '${commandLog}'`)
  await writeStub(seed, 'tmux-name', `printf 'tmux-name [%s]\\n' "$*" >> '${commandLog}'`)
  await git(seed, 'add', '.')
  await git(seed, 'commit', '-m', 'seed')
  await git(seed, 'remote', 'add', 'origin', origin)
  await git(seed, 'push', 'origin', 'main')

  const checkout = join(root, 'checkout')
  await git(root, 'clone', origin, checkout)
  await cp(
    toolingWorktreeDir,
    join(checkout, 'node_modules/vouchington-tooling/scripts/worktree'),
    {
      recursive: true,
    },
  )
  for (const path of generatedPaths) {
    await mkdir(dirname(join(checkout, path)), { recursive: true })
    await writeFile(join(checkout, path), 'generated')
  }
  return { checkout: await realpath(checkout), commandLog }
}

async function writeEnv(checkout: string, worktreeDir: string) {
  await writeFile(
    join(checkout, '.env'),
    `export DATABASE_URL=postgres://localhost/voucha-test
export VALKEY_CONTAINER=voucha-valkey-test
export WORKTREE_DIR=${worktreeDir}
`,
  )
  await writeFile(join(checkout, '.valkey-port'), '6379\n')
}

async function reset(checkout: string) {
  const { stdout } = await execFileAsync('bash', [join(checkout, 'dev/reset-worktree')], {
    cwd: checkout,
    env: { ...process.env, ...gitEnv },
  })
  return stdout
}

async function readLog(commandLog: string) {
  return readFile(commandLog, 'utf8').catch(() => '')
}

describe('reset-worktree product hooks', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('tears down owned resources, removes generated output and session files, then reinitializes', async () => {
    const { checkout, commandLog } = await makeCheckout()
    const hash = createHash('sha256').update(checkout).digest('hex').slice(0, 12)
    await writeEnv(checkout, `d${hash}`)

    const stdout = await reset(checkout)

    const log = await readLog(commandLog)
    expect(log.indexOf('teardown --yes')).toBeGreaterThanOrEqual(0)
    expect(log.indexOf('teardown --yes')).toBeLessThan(log.indexOf('initialize monorepo'))
    expect(log).toContain('tmux-name []')
    for (const path of generatedPaths) expect(await exists(join(checkout, path))).toBe(false)
    expect(await exists(join(checkout, '.env'))).toBe(true)
    expect((await git(checkout, 'branch', '--show-current')).trim()).toMatch(/^reset-[0-9a-f]{8}$/)
    expect(stdout).toContain('Worktree reset complete')
  })

  it('skips teardown when .env belongs to another worktree', async () => {
    const { checkout, commandLog } = await makeCheckout()
    await writeEnv(checkout, 'other-worktree')

    const stdout = await reset(checkout)

    expect(stdout).toContain('not initialized for this worktree; skipping teardown')
    expect(await readLog(commandLog)).not.toContain('teardown')
  })

  it('skips teardown when the worktree was never initialized', async () => {
    const { checkout, commandLog } = await makeCheckout()

    const stdout = await reset(checkout)

    expect(stdout).toContain('never initialized')
    expect(await readLog(commandLog)).not.toContain('teardown')
  })
})
