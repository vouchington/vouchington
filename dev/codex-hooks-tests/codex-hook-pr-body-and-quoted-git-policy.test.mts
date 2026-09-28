import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findPreToolUseBlock } from '../codex-hooks/policy.mts'
import { withTestTempDir } from './test-temp-root.mts'

describe('Codex hook PR body and quoted git policy', () => {
  it('enforces PR creation policy through global repository options', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh -R owner/repo pr create --title "feat: test" --body "Closes #2476"',
        },
      })?.reason,
    ).toContain('draft')

    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh pr --repo=owner/repo edit 123 --body "## Summary"',
        },
      })?.reason,
    ).toContain('Closes #123')
  })

  it('blocks PR body replacements without closing references in ANSI-C quoted shell strings', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: "gh pr edit 123 --body $'## Summary\\n- changed'",
        },
      })?.reason,
    ).toContain('Closes #123')
  })

  it('allows PR create when body file path contains a mismatched $TMPDIR', () => {
    const previous = process.env.TMPDIR
    process.env.TMPDIR = '/nonexistent-tmpdir-mismatch'
    try {
      expect(
        findPreToolUseBlock({
          tool_input: {
            command: 'gh pr create --draft --title "feat: test" --body-file $TMPDIR/pr-body.md',
          },
        }),
      ).toBeNull()
    } finally {
      if (previous === undefined) {
        delete process.env.TMPDIR
      } else {
        process.env.TMPDIR = previous
      }
    }
  })

  it('allows PR create when body file path references an unset env var', () => {
    const previous = process.env.VOUCHA_TEST_UNSET_VAR
    delete process.env.VOUCHA_TEST_UNSET_VAR
    try {
      expect(
        findPreToolUseBlock({
          tool_input: {
            command:
              'gh pr create --draft --title "feat: test" --body-file $VOUCHA_TEST_UNSET_VAR/pr-body.md',
          },
        }),
      ).toBeNull()
    } finally {
      if (previous !== undefined) {
        process.env.VOUCHA_TEST_UNSET_VAR = previous
      }
    }
  })

  it('allows PR create when body file path uses unsupported ${var:-default} expansion', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command:
            'gh pr create --draft --title "feat: test" --body-file ${VOUCHA_TEST_DIR:-/nonexistent}/pr-body.md',
        },
      }),
    ).toBeNull()
  })

  it('allows PR create when body file path uses ~user form that is not expanded', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh pr create --draft --title "feat: test" --body-file ~nobody/pr-body.md',
        },
      }),
    ).toBeNull()
  })

  it('allows PR create when body file path uses $(cmd) substitution that is not expanded', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh pr create --draft --title "feat: test" --body-file $(date +%s)/pr-body.md',
        },
      }),
    ).toBeNull()
  })

  it('still blocks PR create when body file is readable but missing closing keyword', async () => {
    await withTestTempDir('voucha-pr-body-', async dir => {
      await writeFile(join(dir, 'pr-body.md'), '## Summary\n- no closing keyword here\n')

      expect(
        findPreToolUseBlock({
          tool_input: {
            command: `gh pr create --draft --title "feat: test" --body-file ${join(dir, 'pr-body.md')}`,
          },
        })?.reason,
      ).toContain('Closes #123')
    })
  })

  it.each([
    "printf 'git pull --rebase' > docs.md",
    "printf 'git rebase --continue' > docs.md",
    'echo "do not use git commit --amend" > docs.md',
    'git commit -m "document git pull --rebase policy"',
    'bash -lc "printf \'git pull --rebase\' > docs.md"',
  ])('allows banned git text inside quoted command arguments: %s', command => {
    expect(
      findPreToolUseBlock({
        tool_input: { command },
      }),
    ).toBeNull()
  })
})
