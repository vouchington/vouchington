import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const stopServicesPath = fileURLToPath(new URL('../stop-services', import.meta.url))
const dbNameFromUrlPath = fileURLToPath(new URL('../lib/db-name-from-url.sh', import.meta.url))
const refuseOnMainPath = fileURLToPath(new URL('../lib/refuse-on-main.sh', import.meta.url))
const worktreeResourceEnvPath = fileURLToPath(
  new URL('../lib/worktree-resource-env.sh', import.meta.url),
)
const publishedGitWorktreesPath = fileURLToPath(
  new URL(
    '../../node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh',
    import.meta.url,
  ),
)
const testDirs: string[] = []

async function makeRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-stop-services-ownership-'))
  testDirs.push(dir)

  await mkdir(join(dir, 'dev', 'lib'), { recursive: true })
  await writeFile(join(dir, 'dev', 'stop-services'), await readFile(stopServicesPath, 'utf8'))
  await chmod(join(dir, 'dev', 'stop-services'), 0o755)
  await writeFile(
    join(dir, 'dev', 'lib', 'db-name-from-url.sh'),
    await readFile(dbNameFromUrlPath, 'utf8'),
  )
  await writeFile(
    join(dir, 'dev', 'lib', 'refuse-on-main.sh'),
    await readFile(refuseOnMainPath, 'utf8'),
  )
  await writeFile(
    join(dir, 'dev', 'lib', 'worktree-resource-env.sh'),
    await readFile(worktreeResourceEnvPath, 'utf8'),
  )
  await writeFile(
    join(dir, 'dev', 'lib', 'git-worktrees.sh'),
    await readFile(publishedGitWorktreesPath, 'utf8'),
  )
  await writeFile(join(dir, '.git'), 'gitdir: /fake/.git/worktrees/test\n')

  return dir
}

async function makeFakeBin() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-stop-services-ownership-bin-'))
  testDirs.push(dir)
  await writeFile(
    join(dir, 'tmux'),
    `#!/usr/bin/env bash
printf 'tmux %s\\n' "$*" >> "\${FAKE_COMMAND_LOG:?}"
case "$1" in
  has-session) exit 1 ;;
esac
`,
  )
  await chmod(join(dir, 'tmux'), 0o755)
  await writeFile(
    join(dir, 'docker'),
    `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "\${FAKE_COMMAND_LOG:?}"
case "$1" in
  ps) printf '%s\\n' "\${FAKE_DOCKER_PS:-}" ;;
esac
`,
  )
  await chmod(join(dir, 'docker'), 0o755)
  await writeFile(join(dir, 'lsof'), '#!/usr/bin/env bash\n: # no-op\n')
  await chmod(join(dir, 'lsof'), 0o755)
  await writeFile(join(dir, 'ps'), '#!/usr/bin/env bash\n: # no-op\n')
  await chmod(join(dir, 'ps'), 0o755)

  return dir
}

async function readLog(cwd: string) {
  try {
    return await readFile(join(cwd, 'commands.log'), 'utf8')
  } catch {
    return ''
  }
}

describe('stop-services resource ownership', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('ignores inherited Valkey configuration when the worktree has no web environment', async () => {
    const cwd = await makeRepo()
    const logPath = join(cwd, 'commands.log')
    const result = await execFileAsync('bash', [join(cwd, 'dev', 'stop-services')], {
      cwd,
      env: {
        ...process.env,
        FAKE_COMMAND_LOG: logPath,
        FAKE_DOCKER_PS: 'voucha-valkey',
        PATH: `${await makeFakeBin()}:/usr/bin:/bin`,
        VALKEY_CONTAINER: 'voucha-valkey',
      },
    })

    expect(result.stdout).toContain('Valkey container not configured')
    expect(await readLog(cwd)).not.toContain('docker stop voucha-valkey')
  })

  it('clears partial resource env after a malformed .env', async () => {
    const cwd = await makeRepo()
    await writeFile(join(cwd, '.env'), 'export VALKEY_CONTAINER=voucha-valkey\nreturn 1\n')
    const logPath = join(cwd, 'commands.log')
    const result = await execFileAsync('bash', [join(cwd, 'dev', 'stop-services')], {
      cwd,
      env: {
        ...process.env,
        FAKE_COMMAND_LOG: logPath,
        FAKE_DOCKER_PS: 'voucha-valkey',
        PATH: `${await makeFakeBin()}:/usr/bin:/bin`,
      },
    })

    expect(result.stderr).toContain('ignoring all saved service configuration')
    expect(result.stdout).toContain('Valkey container not configured')
    expect(await readLog(cwd)).not.toContain('docker stop voucha-valkey')
  })
})
