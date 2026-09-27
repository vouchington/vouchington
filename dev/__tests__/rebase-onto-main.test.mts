import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const dirs: string[] = []

async function runRebase(args: string[], env: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'voucha-rebase-onto-main-'))
  dirs.push(root)
  const bin = await mkdtemp(join(tmpdir(), 'voucha-rebase-onto-main-bin-'))
  dirs.push(bin)
  await writeFile(
    join(bin, 'git'),
    `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
if [ "$1" = "-C" ]; then shift 2; fi
printf 'git %s\\n' "$*" >> "$log"
case "$*" in
  "diff --name-only --diff-filter=ACDMRTUXB "*)
    printf '%s\\n' "\${PROTECTED_CHECKOUT_DIFF:-}"
    ;;
esac
`,
  )
  await writeFile(
    join(bin, 'gh'),
    `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
printf 'gh %s\\n' "$*" >> "$log"
`,
  )
  await chmod(join(bin, 'git'), 0o755)
  await chmod(join(bin, 'gh'), 0o755)
  const dev = join(root, 'dev')
  await mkdir(join(dev, 'lib'), { recursive: true })
  const repoDev = join(import.meta.dirname, '..')
  await writeFile(join(dev, 'rebase-onto-main'), await readFile(join(repoDev, 'rebase-onto-main')))
  await chmod(join(dev, 'rebase-onto-main'), 0o755)
  await writeFile(
    join(dev, 'lib', 'protected-checkout.sh'),
    await readFile(join(repoDev, 'lib', 'protected-checkout.sh')),
  )
  await writeFile(
    join(dev, 'protected-checkout-paths.txt'),
    await readFile(join(repoDev, 'protected-checkout-paths.txt')),
  )
  const logPath = join(root, 'commands.log')
  try {
    const result = await execFileAsync('bash', [join(dev, 'rebase-onto-main'), ...args], {
      cwd: root,
      env: {
        ...process.env,
        CURSOR_SANDBOX: '',
        SANDBOX_RUNTIME: '',
        ...env,
        FAKE_COMMAND_LOG: logPath,
        PATH: `${bin}:/usr/bin:/bin`,
      },
    })
    return { exitCode: 0, log: await readFile(logPath, 'utf8'), stderr: result.stderr }
  } catch (error: unknown) {
    const failed = error as { code?: number; stderr?: string }
    return {
      exitCode: failed.code ?? 1,
      log: await readFile(logPath, 'utf8').catch(() => ''),
      stderr: failed.stderr ?? '',
    }
  }
}

describe('rebase-onto-main', () => {
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('fetches and rebases when a protected path differs and the process is outside the sandbox', async () => {
    const result = await runRebase([], { PROTECTED_CHECKOUT_DIFF: '.claude/settings.json' })
    expect(result.exitCode).toBe(0)
    expect(result.log).toContain('git fetch origin main')
    expect(result.log).toContain('git rebase origin/main')
  })

  it('stops before rebase when SANDBOX_RUNTIME is set', async () => {
    const result = await runRebase([], {
      PROTECTED_CHECKOUT_DIFF: '.claude/settings.json',
      SANDBOX_RUNTIME: '1',
    })
    expect(result.exitCode).toBe(2)
    expect(result.log).toContain('git fetch origin main')
    expect(result.log).not.toContain('git rebase origin/main')
    expect(result.stderr).toContain('./dev/rebase-onto-main')
  })

  it('stops before rebase when CURSOR_SANDBOX is set', async () => {
    const result = await runRebase([], {
      PROTECTED_CHECKOUT_DIFF: '.claude/settings.json',
      CURSOR_SANDBOX: 'seatbelt',
    })
    expect(result.exitCode).toBe(2)
    expect(result.log).not.toContain('git rebase origin/main')
  })

  it('runs gh stack rebase only after the check passes', async () => {
    const result = await runRebase(['--stack'], { PROTECTED_CHECKOUT_DIFF: '' })
    expect(result.exitCode).toBe(0)
    expect(result.log).toContain('gh stack rebase')
    expect(result.log).not.toContain('git rebase origin/main')
  })
})
