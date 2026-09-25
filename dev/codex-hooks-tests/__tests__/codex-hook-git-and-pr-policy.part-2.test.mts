import { writeFile } from 'node:fs/promises'

import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { readHookPayload } from '../../codex-hooks/hook-payload.mts'
import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'
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
