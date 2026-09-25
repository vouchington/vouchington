import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

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

describe('Codex hook gh stack init abandonment guard (plan #11426/#11439)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows init when no open stacks exist', () => {
    const dir = makeTestTempDirSync('stack-abandon-none-')
    try {
      initRepoWithOriginMain(dir)
      expect(
        findPreToolUseBlock(
          { tool_input: { command: 'gh stack init', cwd: dir } },
          { resolveStackTopology: () => [{ number: 1, open: false, pull_requests: [] }] },
        ),
      ).toBeNull()
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('blocks when HEAD is already a layer of an open stack, even off trunk', () => {
    const dir = makeTestTempDirSync('stack-abandon-layer-')
    try {
      initRepoWithOriginMain(dir)
      execFileSync('git', ['checkout', '-q', '-b', 'feature-already-stacked'], {
        cwd: dir,
        env: isolatedGitEnv(),
      })
      // Deliberately unmerged relative to origin/main: this is the realistic shape of an
      // already-stacked branch, and it also exercises that the abandonment guard's more specific
      // diagnosis wins over the root guard's generic "not merged into origin/main" one — both
      // guards would otherwise fire on this fixture.
      execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'layer work'], {
        cwd: dir,
        env: isolatedGitEnv(),
      })
      const block = findPreToolUseBlock(
        { tool_input: { command: 'gh stack init', cwd: dir } },
        {
          resolveStackTopology: () => [
            {
              base: { ref: 'main' },
              number: 42,
              open: true,
              pull_requests: [
                { head: { ref: 'feature-already-stacked' }, number: 900, state: 'open' },
              ],
            },
          ],
        },
      )
      expect(block?.reason).toContain('already a layer of open stack #42')
      expect(block?.reason).toContain('gh stack add')
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('blocks starting a new stack while a different open stack is unfinished, regardless of who owns it', () => {
    const dir = makeTestTempDirSync('stack-abandon-other-')
    try {
      initRepoWithOriginMain(dir)
      execFileSync('git', ['checkout', '-q', '-b', 'feature-new-stack'], {
        cwd: dir,
        env: isolatedGitEnv(),
      })
      const block = findPreToolUseBlock(
        { tool_input: { command: 'gh stack init', cwd: dir } },
        {
          // Deliberately unrelated authorship/PR numbers in the fixture: this guard reads only
          // `open` state from the unfiltered API response, never provenance, so it fires the same
          // way whether or not this session made the existing stack — that's the point (#11426:
          // "make new stacks, forget about the old ones" is cross-session).
          resolveStackTopology: () => [
            {
              base: { ref: 'main' },
              number: 7,
              open: true,
              pull_requests: [
                { head: { ref: 'someone-elses-layer-1' }, number: 100, state: 'open' },
                { head: { ref: 'someone-elses-layer-2' }, number: 101, state: 'open' },
              ],
            },
          ],
        },
      )
      expect(block?.reason).toContain('unfinished open stack already exists')
      expect(block?.reason).toContain('stack #7')
      expect(block?.reason).toContain('AGENT_STACK_INIT_CONFIRM_SEPARATE=1')
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('allows a deliberate separate stack once acknowledged via env', () => {
    const dir = makeTestTempDirSync('stack-abandon-ack-')
    try {
      initRepoWithOriginMain(dir)
      execFileSync('git', ['checkout', '-q', '-b', 'feature-new-stack'], {
        cwd: dir,
        env: isolatedGitEnv(),
      })
      expect(
        findPreToolUseBlock(
          {
            tool_input: {
              command: 'AGENT_STACK_INIT_CONFIRM_SEPARATE=1 gh stack init',
              cwd: dir,
            },
          },
          {
            resolveStackTopology: () => [
              {
                base: { ref: 'main' },
                number: 7,
                open: true,
                pull_requests: [{ head: { ref: 'someone-elses-layer' }, number: 100 }],
              },
            ],
          },
        ),
      ).toBeNull()
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('still blocks on an unfinished open stack from a detached HEAD', () => {
    const dir = makeTestTempDirSync('stack-abandon-detached-')
    try {
      initRepoWithOriginMain(dir)
      execFileSync('git', ['checkout', '-q', '--detach', 'HEAD'], {
        cwd: dir,
        env: isolatedGitEnv(),
      })
      // With no resolvable branch name, `currentBranchName` returns undefined — this must not
      // short-circuit the "any open stack exists" check, or a detached-HEAD `gh stack init` would
      // sail through an unfinished stack with no signal at all.
      const block = findPreToolUseBlock(
        { tool_input: { command: 'gh stack init', cwd: dir } },
        {
          resolveStackTopology: () => [
            {
              base: { ref: 'main' },
              number: 7,
              open: true,
              pull_requests: [{ head: { ref: 'someone-elses-layer' }, number: 100, state: 'open' }],
            },
          ],
        },
      )
      expect(block?.reason).toContain('unfinished open stack already exists')
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('fails open when the stacks API call is unresolvable', () => {
    const dir = makeTestTempDirSync('stack-abandon-fail-open-')
    try {
      initRepoWithOriginMain(dir)
      expect(
        findPreToolUseBlock(
          { tool_input: { command: 'gh stack init', cwd: dir } },
          { resolveStackTopology: () => undefined },
        ),
      ).toBeNull()
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })
})
