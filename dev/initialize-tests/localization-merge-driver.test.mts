import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const mergeDriverSetupPath = fileURLToPath(
  new URL('../lib/localization-merge-driver.sh', import.meta.url),
)
const testDirs: string[] = []
const driver = 'vouchington-localization git-merge %O %A %B --path %P'

async function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFileAsync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    env: { ...process.env, GIT_EDITOR: 'true', ...env },
  })
}

async function makeRepository() {
  const root = await mkdtemp(join(tmpdir(), 'voucha-localization-merge-driver-'))
  testDirs.push(root)
  const repo = join(root, 'repo')
  await git(root, ['init', '--initial-branch=main', repo])
  await git(repo, ['config', 'user.name', 'localization-test'])
  await git(repo, ['config', 'user.email', 'localization-test@example.invalid'])
  return { repo, root }
}

async function commit(cwd: string, message: string) {
  await git(cwd, ['add', '.'])
  await git(cwd, ['commit', '--message', message])
}

async function configuredDriver(cwd: string) {
  const { stdout } = await git(cwd, [
    'config',
    '--get-all',
    'merge.vouchington-localization.driver',
  ])
  return stdout.trim().split('\n').filter(Boolean)
}

async function configure(cwd: string) {
  await execFileAsync(mergeDriverSetupPath, [cwd])
}

describe('localization merge driver bootstrap', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('configures a fresh clone and remains idempotent', async () => {
    const { repo } = await makeRepository()

    await configure(repo)
    await configure(repo)

    expect(await configuredDriver(repo)).toEqual([driver])
    const { stdout } = await git(repo, ['config', '--get', 'merge.vouchington-localization.name'])
    expect(stdout.trim()).toBe('Merge localization catalog rows')
  })

  it('uses one common config for ordinary linked worktrees', async () => {
    const { repo, root } = await makeRepository()
    await writeFile(join(repo, 'README.md'), 'fixture\n')
    await commit(repo, 'fixture')
    const linked = join(root, 'linked')
    await git(repo, ['worktree', 'add', '-b', 'linked', linked])

    await configure(linked)

    expect(await configuredDriver(repo)).toEqual([driver])
    expect(await configuredDriver(linked)).toEqual([driver])
    const { stdout: worktreeConfig } = await git(linked, [
      'rev-parse',
      '--git-path',
      'config.worktree',
    ])
    expect(existsSync(worktreeConfig.trim())).toBe(false)
  })

  it('passes the logical catalog path to Git’s configured merge driver', async () => {
    const { repo, root } = await makeRepository()
    await mkdir(join(repo, 'localization', 'catalog'), { recursive: true })
    await writeFile(
      join(repo, '.gitattributes'),
      'localization/catalog/aliases.json merge=vouchington-localization\n',
    )
    await writeFile(join(repo, 'localization', 'catalog', 'aliases.json'), '[{"alias":"base"}]\n')
    await commit(repo, 'base catalog')
    await git(repo, ['checkout', '-b', 'theirs'])
    await writeFile(join(repo, 'localization', 'catalog', 'aliases.json'), '[{"alias":"theirs"}]\n')
    await commit(repo, 'theirs catalog')
    await git(repo, ['checkout', 'main'])
    await writeFile(join(repo, 'localization', 'catalog', 'aliases.json'), '[{"alias":"ours"}]\n')
    await commit(repo, 'ours catalog')

    const bin = join(root, 'bin')
    const log = join(root, 'driver.log')
    await mkdir(bin)
    const executable = join(bin, 'vouchington-localization')
    await writeFile(executable, '#!/bin/sh\nprintf "%s\\n" "$*" > "$LOCALIZATION_DRIVER_LOG"\n')
    await chmod(executable, 0o755)
    await configure(repo)

    await git(repo, ['merge', '--no-ff', 'theirs'], {
      LOCALIZATION_DRIVER_LOG: log,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
    })

    const { stdout } = await execFileAsync('cat', [log])
    expect(stdout.trim().split(' ')).toEqual(
      expect.arrayContaining(['git-merge', '--path', 'localization/catalog/aliases.json']),
    )
  })
})
