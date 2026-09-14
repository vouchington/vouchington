import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findPreToolUseBlock } from '../codex-hooks/policy.mts'
import { VALID_PLAN_BODY as validPlanBody } from '../test-helpers/plan-issue/valid-plan-body.mts'
import { withTestTempDir } from './test-temp-root.mts'

const VALID_PLAN_BODY = validPlanBody.replaceAll('\n', '\\n')
const HELPER_REQUIRED = 'dev/plan-issue.mts create'

describe('Codex hook plan issue policy', () => {
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

  it('enforces Plan issue policy through global repository options', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command:
            'gh -R owner/repo issue create --title "Plan: Workflow" --label plan --body "missing"',
        },
      })?.reason,
    ).toContain(HELPER_REQUIRED)
  })

  it('blocks accepted plan issues without the plan label', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: `gh issue create --title "Plan: Workflow" --body "${VALID_PLAN_BODY}" --label docs`,
        },
      })?.reason,
    ).toContain(HELPER_REQUIRED)
  })

  it('blocks accepted plan issues without a Solves section', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh issue create --title "Plan: Workflow" --body "## Summary" --label plan',
        },
      })?.reason,
    ).toContain(HELPER_REQUIRED)
  })

  it('blocks inline accepted plan issue bodies', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: `gh issue create --title "Plan: Workflow" --body "${VALID_PLAN_BODY}" --label plan`,
        },
      })?.reason,
    ).toContain(HELPER_REQUIRED)
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

  it('requires body files with attached short label and title values', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: `gh issue create -t"Plan: Workflow" -l=plan --body "${VALID_PLAN_BODY}"`,
        },
      })?.reason,
    ).toContain(HELPER_REQUIRED)
  })

  it.each([
    `gh issue create --title "Plan: Workflow" --label plan --body $'${VALID_PLAN_BODY}'`,
    `gh issue create --title "Plan: Workflow" --label plan --body=$'${VALID_PLAN_BODY}'`,
    `bash -lc "gh issue create --title \\"Plan: Workflow\\" --label plan --body $'${VALID_PLAN_BODY}'"`,
  ])('requires body files for ANSI-C quoted Plan bodies: %s', command => {
    expect(
      findPreToolUseBlock({
        tool_input: { command },
      })?.reason,
    ).toContain(HELPER_REQUIRED)
  })

  it('blocks accepted plan issues without a Solves section in ANSI-C quoted shell strings', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh issue create --title "Plan: Workflow" --label plan --body $\'## Summary\'',
        },
      })?.reason,
    ).toContain(HELPER_REQUIRED)
  })

  it('checks accepted plan issue body files', async () => {
    await withTestTempDir('voucha-plan-body-', async dir => {
      await writeFile(join(dir, 'plan-body.md'), VALID_PLAN_BODY.replaceAll('\\n', '\n'))

      expect(
        findPreToolUseBlock({
          tool_input: {
            command:
              'gh --repo jonathanong/filaments issue create --title "Plan: Workflow" --label plan --body-file plan-body.md',
            cwd: dir,
          },
        })?.reason,
      ).toContain(HELPER_REQUIRED)
    })
  })

  it('blocks accepted plan issue body files without a Solves section', async () => {
    await withTestTempDir('voucha-plan-body-', async dir => {
      await writeFile(join(dir, 'plan-body.md'), '## Summary\n')

      expect(
        findPreToolUseBlock({
          tool_input: {
            command: 'gh issue create --title "Plan: Workflow" --label plan -F plan-body.md',
            cwd: dir,
          },
        })?.reason,
      ).toContain(HELPER_REQUIRED)
    })
  })

  it('blocks accepted plan issue body files without live browser preflight', async () => {
    await withTestTempDir('voucha-plan-body-', async dir => {
      await writeFile(
        join(dir, 'plan-body.md'),
        VALID_PLAN_BODY.replaceAll('\\n', '\n').replace(
          /## Live browser preflight\n- Status: `not-required`\n\n/,
          '',
        ),
      )

      expect(
        findPreToolUseBlock({
          tool_input: {
            command:
              'gh issue create --title "Plan: Workflow" --label plan --body-file plan-body.md',
            cwd: dir,
          },
        })?.reason,
      ).toContain(HELPER_REQUIRED)
    })
  })

  it('blocks accepted plan issue bodies read from stdin', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh issue create --title "Plan: Workflow" --label plan -F -',
        },
      })?.reason,
    ).toContain(HELPER_REQUIRED)
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

  it('requires the plan helper before resolving an opaque body file path', () => {
    const previous = process.env.TMPDIR
    process.env.TMPDIR = '/nonexistent-tmpdir-mismatch'
    try {
      expect(
        findPreToolUseBlock({
          tool_input: {
            command:
              'gh issue create --title "Plan: X" --label plan --body-file $TMPDIR/plan-body.md',
          },
        }),
      ).toEqual({
        reason:
          'Raw issue creation requires a literal non-Plan title. Accepted Plan issues must use `node dev/plan-issue.mts create ...` so Mermaid syntax and the effective target repository are fully validated.',
      })
    } finally {
      if (previous === undefined) {
        delete process.env.TMPDIR
      } else {
        process.env.TMPDIR = previous
      }
    }
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
