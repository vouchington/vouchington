import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'
import { commandCwd } from '../../codex-hooks/policy/github-command-cwd.mts'
import { isCommandPositionInvocation } from '../../codex-hooks/policy/github-command-position.mts'
import {
  findGitHubWorkflowBlock,
  type GitHubCommandContext,
  tokenizeShellWords,
} from '../../codex-hooks/policy-helpers.mts'
import type { ReferencedIssue } from '../../pr-description/closing-refs.mts'
import { withTestTempDir } from '../test-temp-root.mts'

const BASE_CWD = '/filaments-session'
const PR_BODY = '## Related issues\nCloses #2476'

function tokensOf(command: string): string[] {
  return tokenizeShellWords(command, { splitRedirections: true })
}

function ghIndex(tokens: string[]): number {
  return tokens.findIndex(
    (token, index) => token === 'gh' && isCommandPositionInvocation(tokens, index),
  )
}

function cwdFor(command: string, baseCwd = BASE_CWD): string | undefined {
  const tokens = tokensOf(command)
  return commandCwd(tokens, ghIndex(tokens), baseCwd)
}

function createCommand(prefix: string): string {
  return `${prefix}gh pr create --draft --title "feat: test" --body "${PR_BODY}"`
}

function resolverCwd(
  command: string,
  baseCwd = BASE_CWD,
): {
  block: ReturnType<typeof findGitHubWorkflowBlock>
  context: GitHubCommandContext | undefined
  cwd: string | undefined
} {
  let cwd: string | undefined
  let context: GitHubCommandContext | undefined
  const block = findGitHubWorkflowBlock(command, baseCwd, {
    resolveClosingIssueReference: (_ref, resolverCwd, resolverContext) => {
      cwd = resolverCwd
      context = resolverContext
      return { issue: makeIssue(), ok: true }
    },
    validateClosingIssueReferences: true,
  })
  return { block, context, cwd }
}

describe('commandCwd sequential cd tracking', () => {
  it.each([
    ['cd /other && gh pr create --draft --fill', '/other'],
    ['cd /a && cd /b && gh pr create --draft --fill', '/b'],
    ['cd /a; gh pr create --draft --fill', '/a'],
    ['cd /a\ngh pr create --draft --fill', '/a'],
    ['cd -- /other && gh pr create --draft --fill', '/other'],
    ['cd -L /other && gh pr create --draft --fill', '/other'],
    ['command cd /other && gh pr create --draft --fill', '/other'],
    ['cd "$WORKTREE" && cd /abs && gh pr create --draft --fill', '/abs'],
    ['{ cd /other; }; gh pr create --draft --fill', '/other'],
    ['env -C /other gh pr create --draft --fill', '/other'],
    ['env --chdir=/other gh pr create --draft --fill', '/other'],
    ['env -C /a -C /b gh pr create --draft --fill', '/b'],
    ['cd /a && env -C b gh pr create --draft --fill', resolve('/a', 'b')],
    ['env -C /a nohup env -C b gh pr create --draft --fill', resolve('/a', 'b')],
  ])('applies sequential cd for %s', (command, expected) => {
    expect(cwdFor(command)).toBe(expected)
  })

  it('resolves relative cd against the session cwd', () => {
    expect(cwdFor('cd sub && gh pr create --draft --fill', '/base')).toBe(resolve('/base', 'sub'))
  })

  it.each([
    'cd /other | gh pr create --draft --fill',
    'cd /other & gh pr create --draft --fill',
    'echo cd /other && gh pr create --draft --fill',
    '(cd /wrong; true); gh pr create --draft --fill',
    'printf x | cd /other; gh pr create --draft --fill',
    'f() { cd /other; }; gh pr create --draft --fill',
    'function f { cd /other; }; gh pr create --draft --fill',
    'env cd /other && gh pr create --draft --fill',
  ])('keeps session cwd for %s', command => {
    expect(cwdFor(command)).toBe(BASE_CWD)
  })

  it.each([
    'cd /other || gh pr create --draft --fill',
    'cd $OTHER && gh pr create --draft --fill',
    'cd ~/repo && gh pr create --draft --fill',
    'cd /repo-* && gh pr create --draft --fill',
    'cd -P /other && gh pr create --draft --fill',
    'cd - && gh pr create --draft --fill',
    'cd && gh pr create --draft --fill',
    'if false; then cd /other; fi; gh pr create --draft --fill',
    'cd /primary || cd /fallback; gh pr create --draft --fill',
    'cd "$WORKTREE" && cd packages/api && gh pr create --draft --fill',
    'cd /other extra; gh pr create --draft --fill',
    'env -C "$OTHER" gh pr create --draft --fill',
    'cd $OTHER && env -C b gh pr create --draft --fill',
    'env -S -i gh pr create --draft --fill',
  ])('leaves cwd unknown for %s', command => {
    expect(cwdFor(command)).toBeUndefined()
  })

  it('lexically normalizes absolute cd paths', () => {
    expect(cwdFor('cd /work/link/.. && gh pr create --draft --fill')).toBe('/work')
  })

  it('inherits cwd into a following subshell', () => {
    expect(cwdFor('cd /right && (gh pr create --draft --fill)')).toBe('/right')
  })

  it('returns the shell cwd for a word that is an argument, not a command', () => {
    expect(commandCwd(tokensOf('cd /right && echo gh'), 4, BASE_CWD)).toBe('/right')
  })
})

describe('Codex hook GitHub policy uses command-local cwd', () => {
  it('passes the cd target as the closing-ref resolver cwd', () => {
    const { block, cwd } = resolverCwd(createCommand('cd /other && '))
    expect(block).toBeNull()
    expect(cwd).toBe('/other')
  })

  it('keeps session cwd when there is no cd', () => {
    const { block, cwd } = resolverCwd(createCommand(''))
    expect(block).toBeNull()
    expect(cwd).toBe(BASE_CWD)
  })

  it('does not use a || cd target for closing-ref cwd', () => {
    const { block, cwd } = resolverCwd(createCommand('cd /other || '))
    expect(block).toBeNull()
    expect(cwd).toBeUndefined()
  })

  it('keeps --repo identity when cd is present', () => {
    const { block, context, cwd } = resolverCwd(
      'cd /other && gh pr create --draft --repo github.com/Other/Repo --title "feat: test" --body "## Related issues\nCloses #2476"',
    )
    expect(block).toBeNull()
    expect(cwd).toBe('/other')
    expect(context).toEqual(expect.objectContaining({ repo: 'other/repo' }))
  })

  it('passes same-segment GH_REPO to closing-ref context', () => {
    const { block, context } = resolverCwd(
      'cd /other && GH_REPO=other/repo gh pr create --draft --title "feat: test" --body "## Related issues\nCloses #2476"',
    )
    expect(block).toBeNull()
    expect(context).toEqual(
      expect.objectContaining({ env: expect.objectContaining({ GH_REPO: 'other/repo' }) }),
    )
  })

  it('fail-opens expandable cd instead of blocking lookup', () => {
    const { block, cwd } = resolverCwd(createCommand('cd $OTHER && '))
    expect(block).toBeNull()
    expect(cwd).toBeUndefined()
  })

  it('reads a relative body file from the cd target', async () => {
    await withTestTempDir('voucha-cd-pr-session-', async sessionDir => {
      await withTestTempDir('voucha-cd-pr-body-', async otherDir => {
        await writeFile(join(sessionDir, 'pr-body.md'), '## Summary\nno closing ref\n')
        await writeFile(join(otherDir, 'pr-body.md'), `${PR_BODY}\n`)
        expect(
          findPreToolUseBlock({
            tool_input: {
              command: `gh pr create --draft --title "feat: test" --body-file pr-body.md`,
              cwd: sessionDir,
            },
          })?.reason,
        ).toContain('Closes #123')
        expect(
          findPreToolUseBlock({
            tool_input: {
              command: `cd ${otherDir} && gh pr create --draft --title "feat: test" --body-file pr-body.md`,
              cwd: sessionDir,
            },
          }),
        ).toBeNull()
      })
    })
  })

  it('uses gh-merge-base from the cd checkout', async () => {
    await withTestTempDir('voucha-cd-merge-base-', async dir => {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) =>
            key !== 'GIT_DIR' &&
            key !== 'GIT_WORK_TREE' &&
            key !== 'GIT_INDEX_FILE' &&
            key !== 'GIT_PREFIX',
        ),
      )
      execFileSync('git', ['init', '-q', '-b', 'feature-api'], { cwd: dir, env })
      execFileSync(
        'git',
        ['config', '--local', 'branch.feature-api.gh-merge-base', 'feature-auth'],
        { cwd: dir, env },
      )
      expect(
        findPreToolUseBlock({
          tool_input: {
            command: `cd ${dir} && gh pr create --draft --fill`,
            cwd: BASE_CWD,
          },
        })?.reason,
      ).toContain('PRs must target main')
    })
  })

  it('applies cd inside bash -lc inspected bodies', () => {
    const { cwd } = resolverCwd(
      `bash -lc "cd /other && gh pr create --draft --title t --body 'Closes #2476'"`,
    )
    expect(cwd).toBe('/other')
  })
})

const FIX_MAIN_BODY =
  '## Related issues\n\nRefs #456\nNo closing reference; root-cause issue tracked via the Refs entry above.\n<!-- related-issues-validation: no-closing-ref-fix-main-interim-classifier -->\n\nWorkspace setup: Automation fix-main run'

function fixMainCommand(prefix: string, suffix = ''): string {
  return `${prefix}gh pr create --draft --title "fix: interim classifier"${suffix} --body "${FIX_MAIN_BODY}"`
}

describe('Codex hook Fix Main interim-classifier deferred verification', () => {
  it('blocks the exception when its effective repository cannot be determined', () => {
    const block = findGitHubWorkflowBlock(fixMainCommand('cd $OTHER && '), BASE_CWD, {
      validateClosingIssueReferences: true,
    })
    expect(block?.reason).toContain('Fix Main interim-classifier exception')
  })

  it('does not block the exception when closing-ref validation is disabled', () => {
    const block = findGitHubWorkflowBlock(fixMainCommand('cd $OTHER && '), BASE_CWD, {})
    expect(block).toBeNull()
  })

  it('still verifies the root-cause ref via --repo context despite an unresolvable cd target', () => {
    const block = findGitHubWorkflowBlock(
      fixMainCommand('cd $OTHER && ', ' --repo other/repo'),
      BASE_CWD,
      {
        resolveClosingIssueReference: () => ({
          issue: makeIssue({ state: 'closed', title: 'Closed root cause' }),
          ok: true,
        }),
        validateClosingIssueReferences: true,
      },
    )
    expect(block?.reason).toContain('#456 is CLOSED: Closed root cause')
  })

  it('still verifies the root-cause ref via a same-segment GH_REPO despite an unresolvable cd target', () => {
    const block = findGitHubWorkflowBlock(
      fixMainCommand('cd $OTHER && GH_REPO=other/repo '),
      BASE_CWD,
      {
        resolveClosingIssueReference: () => ({
          issue: makeIssue({ state: 'closed', title: 'Closed root cause' }),
          ok: true,
        }),
        validateClosingIssueReferences: true,
      },
    )
    expect(block?.reason).toContain('#456 is CLOSED: Closed root cause')
  })
})

function makeIssue(overrides: Partial<ReferencedIssue> = {}): ReferencedIssue {
  return {
    body: '',
    isPullRequest: false,
    number: 2476,
    state: 'open',
    title: 'Open issue',
    url: 'https://github.com/owner/repo/issues/2476',
    ...overrides,
  }
}
