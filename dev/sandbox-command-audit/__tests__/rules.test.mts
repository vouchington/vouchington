import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rules } from '../rules.mts'

describe('Voucha sandbox audit policy injection', () => {
  it('routes each coverage list to its product settings field', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'sandbox-policy-'))
    try {
      await mkdir(join(cwd, '.claude'))
      await writeFile(
        join(cwd, '.claude/settings.json'),
        JSON.stringify({
          permissions: { allow: ['Bash(git status *)'], deny: ['Bash(git push --force *)'] },
          sandbox: { excludedCommands: ['./dev/*'] },
        }),
      )
      const policy = await rules.loadPolicy({ cwd })
      if ('error' in policy) throw new Error(policy.error)
      expect(policy.covers('allow', 'git status')).toBe(true)
      expect(policy.covers('deny', 'git push --force origin topic')).toBe(true)
      expect(policy.covers('excluded', './dev/check-task')).toBe(true)
      expect(policy.covers('allow', './dev/check-task')).toBe(false)
      expect(policy.covers('excluded', 'git status')).toBe(false)
    } finally {
      await rm(cwd, { recursive: true })
    }
  })

  it('returns an unavailable policy when an explicit settings file cannot load', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'sandbox-policy-'))
    try {
      const settingsPath = join(cwd, 'invalid.json')
      await writeFile(settingsPath, 'null')
      expect(await rules.loadPolicy({ cwd, settingsPath })).toHaveProperty('error')
    } finally {
      await rm(cwd, { recursive: true })
    }
  })

  it('keeps Git metadata denials separate from genuine bypass candidates for either harness', () => {
    for (const source of ['claude', 'codex'] as const) {
      expect(
        rules.classifyFailure?.(
          'git fetch origin main',
          'error: cannot open /repo/.git/worktrees/example/FETCH_HEAD: Permission denied',
          source,
        ),
      ).toBe('worktree-denial')
      expect(rules.classifyFailure?.('node app.mjs', 'Permission denied', source)).toBeUndefined()
    }
  })
})
