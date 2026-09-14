import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const scriptDir = fileURLToPath(new URL('..', import.meta.url))
const testDirs: string[] = []

async function copyExecutable(cwd: string, name: string) {
  await writeFile(join(cwd, 'dev', name), await readFile(join(scriptDir, name), 'utf8'))
  await chmod(join(cwd, 'dev', name), 0o755)
}

async function copyLib(cwd: string, name: string) {
  await writeFile(
    join(cwd, 'dev', 'lib', name),
    await readFile(join(scriptDir, 'lib', name), 'utf8'),
  )
}

async function makeRepo({ withEnv = true, withValkeyPort = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-reset-worktree-ownership-'))
  testDirs.push(dir)

  await mkdir(join(dir, 'dev', 'lib'), { recursive: true })
  const publishedHelper = 'node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh'
  await mkdir(join(dir, 'node_modules/vouchington-tooling/scripts/worktree'), { recursive: true })
  await writeFile(
    join(dir, publishedHelper),
    await readFile(join(scriptDir, '..', publishedHelper), 'utf8'),
  )
  await mkdir(join(dir, 'backend'), { recursive: true })
  await copyExecutable(dir, 'reset-worktree')
  await copyExecutable(dir, 'teardown')
  await copyExecutable(dir, 'stop-services')
  await copyExecutable(dir, 'tmux-name')
  await copyLib(dir, 'refuse-on-main.sh')
  await copyLib(dir, 'db-name-from-url.sh')
  await copyLib(dir, 'db-target.sh')
  await copyLib(dir, 'git-worktrees.sh')
  await copyLib(dir, 'worktree-resource-env.sh')
  await copyLib(dir, 'git-index-lock.sh')

  await writeFile(
    join(dir, 'dev', 'initialize'),
    `#!/usr/bin/env bash
printf 'initialize %s\\n' "$*" >> "\${FAKE_COMMAND_LOG:?}"
`,
  )
  await chmod(join(dir, 'dev', 'initialize'), 0o755)
  await writeFile(join(dir, '.git'), 'gitdir: /fake/.git/worktrees/test\n')

  if (withEnv) {
    await writeFile(
      join(dir, '.env'),
      `export VALKEY_CONTAINER=voucha-valkey-test
export DATABASE_URL=postgres://localhost/voucha-test
export WORKTREE_DIR=ddeadbeefcafe
`,
    )
  }
  if (withEnv && withValkeyPort) {
    await writeFile(join(dir, '.valkey-port'), '6379\n')
  }

  return dir
}

async function makeFakeBin() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-reset-worktree-ownership-bin-'))
  testDirs.push(dir)

  await writeFile(
    join(dir, 'git'),
    `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
if [ "$1" = "-C" ]; then
  shift 2
fi
case "$*" in
  "rev-parse --show-toplevel") printf '%s' "$(pwd)" ;;
  "diff-index --quiet HEAD --") printf 'git diff-index --quiet HEAD --\\n' >> "$log" ;;
  "status --porcelain --untracked-files=normal") printf 'git status --porcelain\\n' >> "$log" ;;
  "fetch origin main") printf 'git fetch origin main\\n' >> "$log" ;;
  "checkout -B "*) printf 'git %s\\n' "$*" >> "$log" ;;
  "reset --hard origin/main") printf 'git reset --hard origin/main\\n' >> "$log" ;;
  *) printf 'unexpected git invocation: %s\\n' "$*" >&2; exit 1 ;;
esac
`,
  )
  await chmod(join(dir, 'git'), 0o755)
  await writeFile(
    join(dir, 'openssl'),
    '#!/usr/bin/env bash\nif [ "$1" = rand ]; then printf "cafef00d\\n"; else cat >/dev/null; printf "deadbeefcafe%052d\\n" 0; fi\n',
  )
  await chmod(join(dir, 'openssl'), 0o755)
  for (const cmd of ['docker', 'dropdb', 'tmux', 'lsof', 'ps', 'sleep']) {
    await writeFile(
      join(dir, cmd),
      `#!/usr/bin/env bash
printf '${cmd} %s\\n' "$*" >> "\${FAKE_COMMAND_LOG:?}"
`,
    )
    await chmod(join(dir, cmd), 0o755)
  }

  return dir
}

async function readLog(cwd: string) {
  try {
    return await readFile(join(cwd, 'commands.log'), 'utf8')
  } catch {
    return ''
  }
}

async function runReset(cwd: string, binDir: string, env: Record<string, string> = {}) {
  const logPath = join(cwd, 'commands.log')
  const result = await execFileAsync('bash', [join(cwd, 'dev', 'reset-worktree')], {
    cwd,
    env: {
      ...process.env,
      ...env,
      FAKE_COMMAND_LOG: logPath,
      PATH: `${binDir}:/usr/bin:/bin`,
    },
  })
  return { log: await readLog(cwd), stdout: result.stdout }
}

describe('reset-worktree resource ownership', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('skips teardown when only inherited main-worktree env is present', async () => {
    const cwd = await makeRepo({ withEnv: false, withValkeyPort: false })
    const result = await runReset(cwd, await makeFakeBin(), {
      DATABASE_URL: 'postgres://localhost/voucha',
      VALKEY_CONTAINER: 'voucha-valkey',
      WORKTREE_DIR: 'main',
    })

    expect(result.stdout).toContain('never initialized')
    expect(result.log).not.toContain('dropdb')
    expect(result.log).not.toContain('docker rm')
  })

  it('skips teardown when .env belongs to another worktree', async () => {
    const cwd = await makeRepo()
    await writeFile(
      join(cwd, '.env'),
      `export DATABASE_URL=postgres://localhost/voucha-other-worktree
export VALKEY_CONTAINER=voucha-valkey-other-worktree
export WORKTREE_DIR=other-worktree
`,
    )

    const result = await runReset(cwd, await makeFakeBin())

    expect(result.stdout).toContain('not initialized for this worktree; skipping teardown')
    expect(result.log).not.toContain('dropdb')
    expect(result.log).not.toContain('docker rm')
  })

  it('skips teardown when a non-main worktree points at main resources', async () => {
    const cwd = await makeRepo()
    await writeFile(
      join(cwd, '.env'),
      `export DATABASE_URL=postgres://localhost/voucha
export VALKEY_CONTAINER=voucha-valkey
export WORKTREE_DIR=ddeadbeefcafe
`,
    )

    const result = await runReset(cwd, await makeFakeBin())

    expect(result.stdout).toContain('not initialized for this worktree; skipping teardown')
    expect(result.log).not.toContain('dropdb')
    expect(result.log).not.toContain('docker rm')
  })

  it('refuses before teardown or fetch when a non-empty index.lock is present', async () => {
    // Uses the default (genuine-ownership) makeRepo() fixture -- unlike the three tests
    // above, teardown WOULD run here absent the fix, so a `not.toContain('dropdb')`
    // assertion is non-vacuous proof the index.lock preflight runs before it.
    const cwd = await makeRepo()
    const gitDir = join(cwd, 'fake-git-dir')
    await mkdir(gitDir, { recursive: true })
    await writeFile(join(cwd, '.git'), `gitdir: ${gitDir}\n`)
    await writeFile(join(gitDir, 'index.lock'), 'not empty')

    let caught: { code?: number; stderr?: string } | undefined
    try {
      await runReset(cwd, await makeFakeBin())
    } catch (err) {
      caught = err as { code?: number; stderr?: string }
    }

    expect(caught?.code).toBe(1)
    expect(caught?.stderr).toContain('index.lock is non-empty')
    const log = await readLog(cwd)
    expect(log).not.toContain('dropdb')
    expect(log).not.toContain('docker')
    expect(log).not.toContain('fetch origin main')
    expect(await readFile(join(gitDir, 'index.lock'), 'utf8')).toBe('not empty')
  })
})
