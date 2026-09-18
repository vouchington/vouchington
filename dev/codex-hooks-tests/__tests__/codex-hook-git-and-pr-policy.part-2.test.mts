import { writeFile } from 'node:fs/promises'

import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock, readHookPayload } from '../../codex-hooks/policy.mts'
import {
  findGitHubWorkflowBlock,
  type GitHubCommandContext,
} from '../../codex-hooks/policy-helpers.mts'
import type {
  ClosingIssueReference,
  IssueReferenceLookup,
  ReferencedIssue,
} from '../../pr-description/closing-refs.mts'
import { withTestTempDir } from '../test-temp-root.mts'

describe('Codex hook git and PR policy', () => {
  it('allows PR creation without an explicit body for interactive and fill flows', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh pr create --draft --fill',
        },
      }),
    ).toBeNull()
  })

  it('allows PR bodies read from stdin', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh pr create --draft --title "feat: test" -F -',
        },
      }),
    ).toBeNull()
  })

  it('allows PR edits that do not replace the body', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh pr edit 123 --add-label plan',
        },
      }),
    ).toBeNull()
  })

  it('does not treat a gh selector as the end of PR edit options', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh pr edit gh --body "## Summary"',
        },
      })?.reason,
    ).toContain('Closes #123')
  })

  it('checks PR body files relative to the hook cwd', async () => {
    await withTestTempDir('voucha-pr-body-', async dir => {
      await writeFile(join(dir, 'pr-body.md'), '## Related issues\nCloses #2476\n')

      expect(
        findPreToolUseBlock({
          tool_input: {
            command: 'gh pr create --draft --title "feat: test" --body-file pr-body.md',
            cwd: dir,
          },
        }),
      ).toBeNull()
    })
  })

  it('allows a readable scheduled prompt PR body file with the exact no-source representation', async () => {
    await withTestTempDir('voucha-pr-body-', async dir => {
      await writeFile(
        join(dir, 'pr-body.md'),
        '## Related issues\n\nNo source issue; scheduled prompt run.\n<!-- related-issues-validation: no-source-scheduled-prompt -->\n\nWorkspace setup: Auto Harness scheduled prompt\n',
      )
      for (const command of [
        'gh pr create --draft --title "Codex scheduled: test" --body-file pr-body.md',
        'gh pr edit 123 --body-file pr-body.md',
      ]) {
        expect(findPreToolUseBlock({ tool_input: { command, cwd: dir } })).toBeNull()
      }
    })
  })
  it('checks PR body files passed with the short -F flag', async () => {
    await withTestTempDir('voucha-pr-body-', async dir => {
      await writeFile(join(dir, 'pr-body.md'), '## Related issues\nCloses #2476\n')

      expect(
        findPreToolUseBlock({
          tool_input: {
            command: 'gh pr create --draft --title "feat: test" -F pr-body.md',
            cwd: dir,
          },
        }),
      ).toBeNull()
    })
  })

  it('checks PR body files passed with attached short -F flag values', async () => {
    await withTestTempDir('voucha-pr-body-', async dir => {
      await writeFile(join(dir, 'pr-body.md'), '## Related issues\nCloses #2476\n')

      expect(
        findPreToolUseBlock({
          tool_input: {
            command: 'gh pr create --draft --title "feat: test" -F=pr-body.md',
            cwd: dir,
          },
        }),
      ).toBeNull()

      expect(
        findPreToolUseBlock({
          tool_input: {
            command: 'gh pr create --draft --title "feat: test" -Fpr-body.md',
            cwd: dir,
          },
        }),
      ).toBeNull()
    })
  })

  it('expands environment variables in body file paths after trying literal paths', async () => {
    await withTestTempDir('voucha-pr-body-', async dir => {
      await writeFile(join(dir, 'pr-body.md'), '## Related issues\nCloses #2476\n')

      const previous = process.env.VOUCHA_TEST_BODY_DIR
      process.env.VOUCHA_TEST_BODY_DIR = dir
      try {
        expect(
          findPreToolUseBlock({
            tool_input: {
              command:
                'gh pr create --draft --title "feat: test" -F $VOUCHA_TEST_BODY_DIR/pr-body.md',
            },
          }),
        ).toBeNull()
      } finally {
        if (previous === undefined) {
          delete process.env.VOUCHA_TEST_BODY_DIR
        } else {
          process.env.VOUCHA_TEST_BODY_DIR = previous
        }
      }
    })
  })

  it.each([
    'Closes: #2476',
    'Fixes vouchington/vouchington#2476',
    'Resolves: vouchington/vouchington#2476',
  ])('allows documented closing keyword format: %s', closingReference => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: `gh pr create --draft --title "feat: test" --body "${closingReference}"`,
        },
      }),
    ).toBeNull()
  })

  it('reads malformed payloads as empty objects', () => {
    expect(readHookPayload('{')).toEqual({})
  })
})

describe('Codex hook PR closing issue validation', () => {
  it('allows raw gh PR creation when closing refs resolve to open issues', () => {
    expect(
      findGitHubWorkflowBlock(
        'gh pr create --draft --title "feat: test" --body "## Related issues\nCloses #2476"',
        process.cwd(),
        {
          resolveClosingIssueReference: makeSyncResolver(),
          validateClosingIssueReferences: true,
        },
      ),
    ).toBeNull()
  })

  it('blocks raw gh PR creation when a closing ref resolves to a closed issue', () => {
    const block = findGitHubWorkflowBlock(
      'gh pr create --draft --title "feat: test" --body "## Related issues\nCloses #2476"',
      process.cwd(),
      {
        resolveClosingIssueReference: makeSyncResolver({
          '#2476': {
            issue: makeIssue({ state: 'closed', title: 'Closed issue' }),
            ok: true,
          },
        }),
        validateClosingIssueReferences: true,
      },
    )
    expect(block?.reason).toContain('#2476 is CLOSED: Closed issue')
  })

  it('blocks raw gh PR creation when a closing ref resolves to a pull request', () => {
    const block = findGitHubWorkflowBlock(
      'gh pr create --draft --title "feat: test" --body "## Related issues\nCloses #2476"',
      process.cwd(),
      {
        resolveClosingIssueReference: makeSyncResolver({
          '#2476': {
            issue: makeIssue({ isPullRequest: true, title: 'Merged PR' }),
            ok: true,
          },
        }),
        validateClosingIssueReferences: true,
      },
    )
    expect(block?.reason).toContain('#2476 resolves to a pull request')
  })

  it('allows raw gh PR creation with an exact documented escape comment', () => {
    expect(
      findGitHubWorkflowBlock(
        'gh pr create --draft --title "feat: test" --body "## Related issues\nCloses #2476\n<!-- related-issues-validation: allow #2476 because supersedes closed work -->"',
        process.cwd(),
        {
          resolveClosingIssueReference: makeSyncResolver({
            '#2476': {
              issue: makeIssue({ state: 'closed', title: 'Closed issue' }),
              ok: true,
            },
          }),
          validateClosingIssueReferences: true,
        },
      ),
    ).toBeNull()
  })

  it('passes gh --repo context to closing reference resolution', () => {
    const contexts: GitHubCommandContext[] = []
    const block = findGitHubWorkflowBlock(
      'gh pr create --draft --repo github.com/Other/Repo --title "feat: test" --body "## Related issues\nCloses #2476"',
      process.cwd(),
      {
        resolveClosingIssueReference: (_ref, _cwd, context) => {
          contexts.push(context)
          return { issue: makeIssue(), ok: true }
        },
        validateClosingIssueReferences: true,
      },
    )

    expect(block).toBeNull()
    expect(contexts).toEqual([expect.objectContaining({ repo: 'other/repo' })])
  })

  it('passes inline shell environment to closing reference resolution', () => {
    const contexts: GitHubCommandContext[] = []
    const block = findGitHubWorkflowBlock(
      'env -u GH_HOST GH_TOKEN=token gh pr create --draft --title "feat: test" --body "## Related issues\nCloses #2476"',
      process.cwd(),
      {
        resolveClosingIssueReference: (_ref, _cwd, context) => {
          contexts.push(context)
          return { issue: makeIssue(), ok: true }
        },
        validateClosingIssueReferences: true,
      },
    )

    expect(block).toBeNull()
    expect(contexts).toEqual([
      expect.objectContaining({
        env: expect.objectContaining({ GH_HOST: undefined, GH_TOKEN: 'token' }),
      }),
    ])
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

function makeSyncResolver(
  overrides: Record<string, IssueReferenceLookup> = {},
): (ref: ClosingIssueReference) => IssueReferenceLookup {
  return ref =>
    overrides[ref.key] ?? {
      issue: makeIssue({ number: ref.number }),
      ok: true,
    }
}
