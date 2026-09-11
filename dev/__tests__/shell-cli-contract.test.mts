import { execFile } from 'node:child_process'
import { access, chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = resolve(import.meta.dirname, '../..')
const tempDirs: string[] = []
const surplusArguments: Record<string, string[]> = {
  'benchmark-topic-metrics': ['--label', 'candidate', 'extra'],
  cleanup: ['--yes', '--yes'],
  'db-clean': ['--db-only', '--db-only'],
  initialize: ['web', 'extra'],
  'stop-services': ['--keep-valkey', '--keep-valkey'],
  teardown: ['--yes', '--yes'],
  tmux: ['--no-attach', '--no-attach'],
  'reset-worktree': ['--force', '--force'],
}

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function runScript(script: string, args: string[], cwd: string, path: string) {
  try {
    const result = await execFileAsync('/bin/bash', [join(cwd, 'dev', script), ...args], {
      cwd,
      env: { ...process.env, PATH: `${path}:/usr/bin:/bin` },
    })
    return { status: 0, stderr: result.stderr, stdout: result.stdout }
  } catch (error) {
    const failure = error as { code: number; stderr: string; stdout: string }
    return { status: failure.code, stderr: failure.stderr, stdout: failure.stdout }
  }
}

describe('dev shell CLI contracts', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it.each([
    'benchmark-topic-metrics',
    'initialize',
    'tmux',
    'tmux-name',
    'reset',
    'db-clean',
    'reset-worktree',
    'stop-services',
    'teardown',
    'cleanup',
    'unstick-locks',
    'valkey-logs',
    'logs',
    'otel-up',
    'otel-down',
  ])('keeps help and invalid arguments inert for %s', async script => {
    const cwd = await makeTempDir(`voucha-${script}-contract-`)
    const envMarker = join(cwd, 'env-sourced')
    const commandLog = join(cwd, 'commands.log')
    const binDir = join(cwd, 'bin')
    const devDir = join(cwd, 'dev')
    await mkdir(binDir)
    await mkdir(devDir)
    await cp(join(repoRoot, 'dev', script), join(devDir, script))
    await cp(join(repoRoot, 'dev', 'lib'), join(devDir, 'lib'), { recursive: true })
    await writeFile(join(cwd, '.env'), `touch ${envMarker}\n`)
    const statefulCommands = [
      'apt-get',
      'brew',
      'cargo',
      'createdb',
      'docker',
      'dropdb',
      'git',
      'pnpm',
      'sudo',
      'tmux',
    ]
    await Promise.all(
      statefulCommands.map(async command => {
        const path = join(binDir, command)
        await writeFile(path, `#!/bin/bash\necho "${command} $*" >> "${commandLog}"\nexit 0\n`)
        await chmod(path, 0o755)
      }),
    )

    for (const help of ['-h', '--help']) {
      const result = await runScript(script, [help], cwd, binDir)
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('Usage:')
    }

    const invalid = await runScript(script, ['--help', '--typo'], cwd, binDir)
    expect(invalid.status).toBe(2)
    const typo = await runScript(script, ['--typo'], cwd, binDir)
    expect(typo.status).toBe(2)
    const surplus = await runScript(
      script,
      surplusArguments[script] ?? ['extra', 'extra'],
      cwd,
      binDir,
    )
    expect(surplus.status).toBe(2)
    await expect(access(envMarker)).rejects.toThrow(/ENOENT/)
    await expect(access(commandLog)).rejects.toThrow(/ENOENT/)
  })

  it('runs reset orchestration in order without arguments', async () => {
    const root = await makeTempDir('voucha-reset-contract-')
    const devDir = join(root, 'dev')
    const libDir = join(devDir, 'lib')
    const binDir = join(root, 'bin')
    const log = join(root, 'commands.log')
    await mkdir(libDir, { recursive: true })
    await mkdir(binDir)
    await mkdir(join(root, 'backend'))
    await mkdir(join(root, '.git'))
    await cp(join(repoRoot, 'dev', 'reset'), join(devDir, 'reset'))
    await cp(join(repoRoot, 'dev', 'lib', 'refuse-on-main.sh'), join(libDir, 'refuse-on-main.sh'))
    await cp(
      join(repoRoot, 'dev', 'lib', 'db-name-from-url.sh'),
      join(libDir, 'db-name-from-url.sh'),
    )
    await cp(
      join(repoRoot, 'dev', 'lib', 'worktree-resource-env.sh'),
      join(libDir, 'worktree-resource-env.sh'),
    )
    await writeFile(
      join(root, '.env'),
      'DATABASE_URL=postgresql://localhost/voucha_test\nVALKEY_CONTAINER=test-valkey\n',
    )
    await writeFile(
      join(devDir, 'stop-services'),
      `#!/bin/bash\necho "stop-services $*" >> "${log}"\n`,
    )
    await writeFile(join(devDir, 'db-clean'), `#!/bin/bash\necho "db-clean $*" >> "${log}"\n`)
    await writeFile(
      join(binDir, 'git'),
      `#!/bin/bash\nif [[ "$*" == *"--show-toplevel"* ]]; then echo "${root}"; fi\n`,
    )
    await writeFile(join(binDir, 'pnpm'), `#!/bin/bash\necho "pnpm $*" >> "${log}"\n`)
    await Promise.all(
      ['reset', 'stop-services', 'db-clean'].map(file => chmod(join(devDir, file), 0o755)),
    )
    await Promise.all(['git', 'pnpm'].map(file => chmod(join(binDir, file), 0o755)))

    const isolatedTmp = await makeTempDir('voucha-reset-contract-tmp-')
    await execFileAsync('/bin/bash', [join(devDir, 'reset')], {
      cwd: root,
      env: {
        ...process.env,
        FORCE_MAIN_RESET: '1',
        PATH: `${binDir}:/usr/bin:/bin`,
        TEMP: isolatedTmp,
        TMP: isolatedTmp,
        TMPDIR: isolatedTmp,
      },
    })

    expect((await readFile(log, 'utf8')).trim().split('\n')).toEqual([
      'stop-services --keep-valkey',
      'db-clean ',
      'pnpm run db:migrate',
    ])
  })
})
