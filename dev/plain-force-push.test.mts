import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PLAIN_FORCE_PUSH_REASON } from './codex-hooks/policy/blocked-command-patterns.mts'
import { gitPushAncestorCommand, plainForcePushReason } from './plain-force-push.mts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hookPath = resolve(repoRoot, '.husky/pre-push')

const rejected = [
  'git push --force',
  'git push --force origin main',
  'git push origin --force',
  'git push --force --force-with-lease',
  'git push -f',
  'git push -uf origin main',
  'git push +HEAD:main',
  'git push origin +HEAD:main',
  'git -C /repo push --force origin main',
  '/usr/bin/git push --force origin main',
]

const allowed = [
  'git push',
  'git push origin HEAD',
  'git push --force-with-lease',
  'git push --force-with-lease origin feature',
  'git push --force-with-lease=origin/feature:abc origin feature',
  'git push origin --force-with-lease',
  'git -C /repo push --force-with-lease',
  '/usr/bin/git push --force-with-lease origin feature',
]

function developerEnv(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra }
  delete env.GITHUB_ACTIONS
  delete env.HUSKY
  return env
}

function runHook(extra: Record<string, string | undefined> = {}) {
  return spawnSync('sh', [hookPath], { encoding: 'utf8', env: developerEnv(extra) })
}

describe('plainForcePushReason', () => {
  it.each(rejected)('rejects %s', command => {
    expect(plainForcePushReason(command)).toBe(PLAIN_FORCE_PUSH_REASON)
  })

  it.each(allowed)('allows %s', command => {
    expect(plainForcePushReason(command)).toBeNull()
  })
})

describe('gitPushAncestorCommand', () => {
  it('reads git above the husky trampoline', () => {
    const processes = new Map<number, { parent: number; args: string }>([
      [10, { parent: 9, args: 'node dev/plain-force-push.mts' }],
      [9, { parent: 8, args: 'sh -e .husky/pre-push origin https://example.test/repo.git' }],
      [8, { parent: 7, args: 'sh .husky/_/pre-push origin https://example.test/repo.git' }],
      [7, { parent: 1, args: 'git push --force-with-lease origin feature' }],
    ])

    expect(
      gitPushAncestorCommand(10, {
        args: pid => processes.get(pid)?.args,
        parent: pid => processes.get(pid)?.parent,
      }),
    ).toBe('git push --force-with-lease origin feature')
  })
})

const scriptPath = resolve(repoRoot, 'dev/plain-force-push.mts')
const symlinkedScriptPath = scriptPath.startsWith('/private/')
  ? `/${scriptPath.slice('/private/'.length)}`
  : scriptPath
const canReadProcessArgs =
  spawnSync('ps', ['-o', 'args=', '-p', String(process.pid)], { encoding: 'utf8' }).status === 0

describe('pre-push hook', () => {
  it('rejects a supplied plain force push and allows a lease push', () => {
    const rejectedPush = runHook({ GIT_PUSH_COMMAND: 'git push --force origin main' })
    expect(rejectedPush.status).toBe(1)
    expect(rejectedPush.stderr).toContain(PLAIN_FORCE_PUSH_REASON)
    expect(rejectedPush.stderr).toContain('--force-with-lease')

    const lease = runHook({
      GIT_PUSH_COMMAND: 'git push --force-with-lease=origin/feature:abc origin feature',
    })
    expect(lease.status).toBe(0)
    expect(lease.stderr).toBe('')
  })

  it('stays quiet in GitHub Actions', () => {
    const result = spawnSync('sh', [hookPath], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: 'true', GIT_PUSH_COMMAND: 'git push --force' },
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it.skipIf(symlinkedScriptPath === scriptPath)(
    'rejects the script when macOS addresses it through /var',
    () => {
      expect(existsSync(symlinkedScriptPath)).toBe(true)
      const result = spawnSync(process.execPath, [symlinkedScriptPath], {
        encoding: 'utf8',
        env: developerEnv({ GIT_PUSH_COMMAND: 'git push --force origin main' }),
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(PLAIN_FORCE_PUSH_REASON)
    },
  )

  it.skipIf(!canReadProcessArgs)(
    'rejects a real plain force push and allows --force-with-lease',
    () => {
      const root = mkdtempSync(`${tmpdir()}/plain-force-push-`)
      const source = `${root}/src`
      const remote = `${root}/remote.git`
      const env = developerEnv()
      const git = (...args: string[]) =>
        spawnSync('git', ['-C', source, ...args], { encoding: 'utf8', env })

      try {
        expect(
          spawnSync('git', ['init', '-q', '-b', 'main', source], { encoding: 'utf8' }).status,
        ).toBe(0)
        expect(
          spawnSync('git', ['init', '-q', '--bare', remote], { encoding: 'utf8' }).status,
        ).toBe(0)
        expect(git('config', 'user.email', 'tests+plain-force@voucha.ai').status).toBe(0)
        expect(git('config', 'user.name', 'plain-force').status).toBe(0)
        expect(
          spawnSync('git', ['-C', source, 'commit', '-q', '--allow-empty', '-m', 'init'], {
            encoding: 'utf8',
            env,
          }).status,
        ).toBe(0)
        expect(git('commit', '-q', '--allow-empty', '-m', 'second').status).toBe(0)
        expect(git('config', 'core.hooksPath', resolve(repoRoot, '.husky')).status).toBe(0)
        expect(git('remote', 'add', 'origin', remote).status).toBe(0)
        expect(git('push', '-q', 'origin', 'HEAD:refs/heads/main').status).toBe(0)
        const published = git('rev-parse', 'HEAD').stdout.trim()
        expect(git('reset', '-q', '--hard', 'HEAD~1').status).toBe(0)

        const forced = git('push', '--force', 'origin', 'HEAD:refs/heads/main')
        expect(forced.status).not.toBe(0)
        expect(forced.stderr).toContain(PLAIN_FORCE_PUSH_REASON)
        expect(
          spawnSync('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/main'], {
            encoding: 'utf8',
          }).stdout.trim(),
        ).toBe(published)

        const lease = git('push', '--force-with-lease', 'origin', 'HEAD:refs/heads/main')
        expect(lease.status).toBe(0)
        expect(
          spawnSync('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/main'], {
            encoding: 'utf8',
          }).stdout.trim(),
        ).toBe(git('rev-parse', 'HEAD').stdout.trim())
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})
