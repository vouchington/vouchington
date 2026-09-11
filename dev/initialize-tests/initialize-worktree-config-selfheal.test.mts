import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { initializeBashArgs } from '../test-helpers/initialize.mts'

const execFileAsync = promisify(execFile)

const testDirs: string[] = []

async function makeSharedConfig(contents: string) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-heal-shared-git-config-'))
  testDirs.push(dir)
  const configPath = join(dir, 'config')
  await writeFile(configPath, contents)
  return configPath
}

async function healConfig(configPath: string) {
  await execFileAsync('bash', initializeBashArgs('heal_shared_git_config "$1"', [configPath]))
  return readFile(configPath, 'utf8')
}

describe('heal_shared_git_config', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('strips a stray core.worktree pointing at a linked worktree', async () => {
    const configPath = await makeSharedConfig(
      '[core]\n\trepositoryformatversion = 0\n\tworktree = /repo/.claude/worktrees/reset-9651b0ad-recovery\n',
    )

    const healed = await healConfig(configPath)

    expect(healed).not.toContain('worktree =')
  })

  it('resets core.bare to false', async () => {
    const configPath = await makeSharedConfig('[core]\n\tbare = true\n')

    const healed = await healConfig(configPath)

    expect(healed).toContain('bare = false')
  })

  it('removes extensions.worktreeConfig', async () => {
    const configPath = await makeSharedConfig('[extensions]\n\tworktreeConfig = true\n')

    const healed = await healConfig(configPath)

    expect(healed).not.toContain('worktreeConfig')
  })

  it('leaves an already-clean config untouched', async () => {
    const configPath = await makeSharedConfig(
      '[core]\n\trepositoryformatversion = 0\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:example/repo.git\n',
    )

    const healed = await healConfig(configPath)

    expect(healed).toContain('bare = false')
    expect(healed).toContain('url = git@github.com:example/repo.git')
    expect(healed).not.toContain('worktree =')
  })
})
