import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'
import { makeTestTempDirSync } from '../test-temp-root.mts'

function isolatedGitEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        key !== 'GIT_DIR' &&
        key !== 'GIT_WORK_TREE' &&
        key !== 'GIT_INDEX_FILE' &&
        key !== 'GIT_PREFIX',
    ),
  )
}

describe('Codex hook gh stack merge policy', () => {
  it.each([
    'gh stack merge 12',
    'gh stack merge 12 --yes --squash',
    'bash -lc "gh stack merge 12 --yes --squash"',
    'gh extension exec stack merge 12 --yes --squash',
    'gh extensions exec stack merge 12 --yes --squash',
    'gh ext exec stack merge 12 --yes --squash',
    'gh-stack merge 12 --yes --squash',
    '/usr/local/bin/gh-stack merge 12 --yes --squash',
  ])('blocks stacked merge in automation: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'never delegated to an agent',
    )
  })

  it.each(['gh stack merge 12', 'gh stack merge 12 --yes --squash', 'gh stack merge 12 --yes'])(
    'confirms stacked merge interactively: %s',
    command => {
      const block = findPreToolUseBlock({ tool_input: { command } }, { automationContext: false })
      expect(block?.disposition).toBe('confirm')
      expect(block?.reason).toContain('human decision')
    },
  )

  it.each(['gh stack merge', 'gh stack merge --yes --squash', 'gh stack merge --squash'])(
    'blocks a selector-less stack merge even interactively: %s',
    command => {
      const block = findPreToolUseBlock({ tool_input: { command } }, { automationContext: false })
      expect(block?.reason).toContain('PR-number selector')
    },
  )
})

describe('Codex hook gh stack submit and link policy', () => {
  it.each([
    'gh stack submit --open',
    'gh stack submit --auto --open',
    'gh stack submit --open=true',
  ])('blocks ready stack submit: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'opened as draft first',
    )
  })

  it('blocks interactive submit without --auto as a TUI', () => {
    expect(findPreToolUseBlock({ tool_input: { command: 'gh stack submit' } })?.reason).toContain(
      'gh stack submit is an interactive TUI',
    )
  })

  it('allows gh stack submit --auto', () => {
    expect(findPreToolUseBlock({ tool_input: { command: 'gh stack submit --auto' } })).toBeNull()
  })

  it('blocks gh stack submit --auto=false as a TUI', () => {
    expect(
      findPreToolUseBlock({ tool_input: { command: 'gh stack submit --auto=false' } })?.reason,
    ).toContain('gh stack submit is an interactive TUI')
  })

  it('allows gh stack submit --auto --open=false', () => {
    expect(
      findPreToolUseBlock({ tool_input: { command: 'gh stack submit --auto --open=false' } }),
    ).toBeNull()
  })

  it('blocks gh stack link --open', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'gh stack link --open feature-auth feature-api' },
      })?.reason,
    ).toContain('opened as draft first')
  })

  it('allows gh stack link without --open', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'gh stack link feature-auth feature-api' },
      }),
    ).toBeNull()
  })

  it.each(['gh stack rebase', 'gh stack sync', 'gh stack push', 'gh stack view --json'])(
    'allows stack maintenance: %s',
    command => {
      expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
    },
  )

  it.each(['gh stack modify', 'gh stack switch', 'gh stack trunk', 'gh-stack modify'])(
    'blocks interactive or non-allowlisted stack commands: %s',
    command => {
      expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
        'gh stack allowlist is closed',
      )
    },
  )
})

describe('Codex hook gh stack checkout target', () => {
  it.each([
    'gh stack checkout 123',
    'gh-stack checkout 123',
    'gh extension exec stack checkout 123',
    'cd /work/tree && gh stack checkout 123 && gh stack rebase',
  ])('allows exactly one numeric target: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
  })

  it.each([
    'gh stack checkout my-branch',
    'gh stack checkout',
    'gh stack checkout 12 34',
    'gh stack checkout 12a',
    'gh stack checkout 012',
    'gh stack checkout 0',
    'gh-stack checkout my-branch',
  ])('blocks any other target: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'exactly one stack number or PR number',
    )
  })
})

describe('Codex hook hand-rolled stack base policy', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([
    'gh pr create --draft --base feature-auth --title "feat: x" --body "Closes #1"',
    'gh pr create --draft --base=feature-auth --fill',
    'gh pr create --draft -B feature-auth --fill',
    'gh pr create --draft -Bfeature-auth --fill',
    'gh pr create --draft -dBfeature-auth --fill',
    'gh pr create --draft -dB feature-auth --fill',
    'gh pr new --draft -B feature-auth --fill',
    'gh pr edit 12 --base feature-auth',
    'gh pr edit 12 --base=feature-auth',
    'gh pr edit 12 -B feature-auth',
    // An explicit base needs no checkout, so a directory the hook cannot read still gets checked.
    'env -C"$PWD" gh pr create --draft --base feature-auth --fill',
    'env --chdir="$DIR" gh pr edit 12 -B feature-auth',
  ])('blocks targeting an unmerged branch: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'PRs must target main',
    )
  })

  it.each([
    'gh pr create --draft --fill',
    'gh pr create --draft --base main --fill',
    'gh pr create --draft -B main --fill',
    'gh pr edit 12 --add-label plan',
    'gh pr edit 12 --base main',
    'gh pr edit 12 -B main',
    'env -C"$PWD" gh pr create --draft --base main --fill',
  ])('allows targeting main or omitting --base: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
  })

  it('blocks an empty --base= value', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'gh pr create --draft --base= --fill' },
      })?.reason,
    ).toContain('PRs must target main')
  })

  it('blocks omitted --base when gh-merge-base is a non-main branch', () => {
    const dir = makeTestTempDirSync('gh-merge-base-')
    try {
      execFileSync('git', ['init', '-q', '-b', 'feature-api'], { cwd: dir, env: isolatedGitEnv() })
      execFileSync(
        'git',
        ['config', '--local', 'branch.feature-api.gh-merge-base', 'feature-auth'],
        { cwd: dir, env: isolatedGitEnv() },
      )
      expect(
        findPreToolUseBlock({
          tool_input: { command: 'gh pr create --draft --fill', cwd: dir },
        })?.reason,
      ).toContain('PRs must target main')
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('blocks omitted --base when gh-merge-base is set in global git config', () => {
    const dir = makeTestTempDirSync('gh-merge-base-global-')
    const globalConfig = join(dir, 'global.gitconfig')
    writeFileSync(globalConfig, '')
    const env = {
      ...isolatedGitEnv(),
      GIT_CONFIG_GLOBAL: globalConfig,
      GIT_CONFIG_NOSYSTEM: '1',
    }
    try {
      execFileSync('git', ['init', '-q', '-b', 'feature-api'], { cwd: dir, env })
      execFileSync(
        'git',
        ['config', '--global', 'branch.feature-api.gh-merge-base', 'feature-auth'],
        { cwd: dir, env },
      )
      vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfig)
      vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
      expect(
        findPreToolUseBlock({
          tool_input: { command: 'gh pr create --draft --fill', cwd: dir },
        })?.reason,
      ).toContain('PRs must target main')
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('allows omitted --base when no local gh-merge-base is set', () => {
    const dir = makeTestTempDirSync('gh-merge-base-none-')
    try {
      execFileSync('git', ['init', '-q', '-b', 'feature-api'], { cwd: dir, env: isolatedGitEnv() })
      expect(
        findPreToolUseBlock({
          tool_input: { command: 'gh pr create --draft --fill', cwd: dir },
        }),
      ).toBeNull()
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('does not apply gh-merge-base to gh pr edit', () => {
    const dir = makeTestTempDirSync('gh-merge-base-edit-')
    try {
      execFileSync('git', ['init', '-q', '-b', 'feature-api'], { cwd: dir, env: isolatedGitEnv() })
      execFileSync(
        'git',
        ['config', '--local', 'branch.feature-api.gh-merge-base', 'feature-auth'],
        { cwd: dir, env: isolatedGitEnv() },
      )
      expect(
        findPreToolUseBlock({
          tool_input: { command: 'gh pr edit 12 --add-label plan', cwd: dir },
        }),
      ).toBeNull()
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('blocks gh pr new without --draft', () => {
    expect(findPreToolUseBlock({ tool_input: { command: 'gh pr new --fill' } })?.reason).toContain(
      'opened as draft first',
    )
  })
})

describe('Codex hook gh stack recovery and maintenance actions (#11439)', () => {
  it.each(['gh stack unstack', 'gh stack unstack --local', 'gh stack delete', 'gh-stack unstack'])(
    'allows the mis-rooted-stack recovery path: %s',
    command => {
      expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
    },
  )

  it('does not affect gh stack add', () => {
    expect(
      findPreToolUseBlock({ tool_input: { command: 'gh stack add --base feature-auth' } }),
    ).toBeNull()
  })
})
