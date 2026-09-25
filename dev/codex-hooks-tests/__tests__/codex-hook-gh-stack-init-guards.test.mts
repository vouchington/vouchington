import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'
import { makeTestTempDirSync } from '../test-temp-root.mts'

function isolatedGitEnv(): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          key !== 'GIT_DIR' &&
          key !== 'GIT_WORK_TREE' &&
          key !== 'GIT_INDEX_FILE' &&
          key !== 'GIT_PREFIX',
      ),
    ),
    // Runner-ambient global git identity is not guaranteed — pin author/committer explicitly
    // so `git commit` never depends on it.
    GIT_AUTHOR_NAME: 'Codex Hooks Test',
    GIT_AUTHOR_EMAIL: 'codex-hooks-test@example.test',
    GIT_COMMITTER_NAME: 'Codex Hooks Test',
    GIT_COMMITTER_EMAIL: 'codex-hooks-test@example.test',
  }
}

function initRepoWithOriginMain(dir: string): void {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, env: isolatedGitEnv() })
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], {
    cwd: dir,
    env: isolatedGitEnv(),
  })
  execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'refs/heads/main'], {
    cwd: dir,
    env: isolatedGitEnv(),
  })
}

describe('Codex hook gh stack init root guard (#11376, #11352)', () => {
  it('blocks --base naming a branch other than main', () => {
    const dir = makeTestTempDirSync('stack-init-base-')
    try {
      initRepoWithOriginMain(dir)
      expect(
        findPreToolUseBlock({
          tool_input: { command: 'gh stack init --base feature-auth', cwd: dir },
        })?.reason,
      ).toContain('gh stack init must root on main')
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('blocks -b naming a branch other than main', () => {
    const dir = makeTestTempDirSync('stack-init-base-short-')
    try {
      initRepoWithOriginMain(dir)
      expect(
        findPreToolUseBlock({
          tool_input: { command: 'gh stack init -b feature-auth', cwd: dir },
        })?.reason,
      ).toContain('gh stack init must root on main')
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it.each([
    'gh stack init --base=feature-auth',
    'gh stack init -bfeature-auth',
    'gh stack init --base=',
  ])('blocks other --base spellings: %s', command => {
    const dir = makeTestTempDirSync('stack-init-base-spelling-')
    try {
      initRepoWithOriginMain(dir)
      expect(findPreToolUseBlock({ tool_input: { command, cwd: dir } })?.reason).toContain(
        'gh stack init must root on main',
      )
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  // An explicit base needs no checkout, so a directory the hook cannot read still gets checked.
  it.each([
    'env -C"$PWD" gh stack init --base feature-auth',
    'cd "$STACK_DIR" && gh stack init -b feature-auth',
  ])('blocks a non-main base when the directory is unknown: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'gh stack init must root on main',
    )
  })

  it('allows a main base when the directory is unknown', () => {
    expect(
      findPreToolUseBlock({ tool_input: { command: 'env -C"$PWD" gh stack init --base main' } }),
    ).toBeNull()
  })

  it('blocks initializing from a branch ahead of origin/main', () => {
    const dir = makeTestTempDirSync('stack-init-off-trunk-')
    try {
      initRepoWithOriginMain(dir)
      execFileSync('git', ['checkout', '-q', '-b', 'feature-auth'], {
        cwd: dir,
        env: isolatedGitEnv(),
      })
      execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'unmerged work'], {
        cwd: dir,
        env: isolatedGitEnv(),
      })
      expect(
        findPreToolUseBlock({ tool_input: { command: 'gh stack init', cwd: dir } })?.reason,
      ).toContain('must run from a commit already merged into origin/main')
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('allows initializing from a commit already on origin/main', () => {
    const dir = makeTestTempDirSync('stack-init-on-trunk-')
    try {
      initRepoWithOriginMain(dir)
      // No open stacks in this fixture — resolveStackTopology stubbed so this test isolates the
      // root guard from the abandonment guard exercised separately in
      // codex-hook-gh-stack-abandonment-guard.test.mts.
      expect(
        findPreToolUseBlock(
          { tool_input: { command: 'gh stack init', cwd: dir } },
          { resolveStackTopology: () => [] },
        ),
      ).toBeNull()
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('allows --base main explicitly from trunk', () => {
    const dir = makeTestTempDirSync('stack-init-explicit-main-')
    try {
      initRepoWithOriginMain(dir)
      expect(
        findPreToolUseBlock(
          { tool_input: { command: 'gh stack init --base main', cwd: dir } },
          { resolveStackTopology: () => [] },
        ),
      ).toBeNull()
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('fails open when origin/main cannot be resolved (no remote configured)', () => {
    const dir = makeTestTempDirSync('stack-init-no-origin-')
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, env: isolatedGitEnv() })
      execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], {
        cwd: dir,
        env: isolatedGitEnv(),
      })
      expect(
        findPreToolUseBlock(
          { tool_input: { command: 'gh stack init', cwd: dir } },
          { resolveStackTopology: () => [] },
        ),
      ).toBeNull()
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })
})
