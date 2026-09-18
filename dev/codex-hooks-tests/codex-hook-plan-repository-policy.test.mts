import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../codex-hooks/policy.mts'
import { VALID_PLAN_BODY } from '../test-helpers/plan-issue/valid-plan-body.mts'
import { withTestTempDir } from './test-temp-root.mts'

describe('Codex hook Plan repository policy', () => {
  it('requires the helper before inspecting an explicit-repository body', async () => {
    await withTestTempDir('voucha-plan-body-', async dir => {
      await writeFile(
        join(dir, 'plan-body.md'),
        VALID_PLAN_BODY.replace('vouchington/vouchington/issues/7390', 'owner/two/issues/7390'),
      )

      expect(
        findPreToolUseBlock({
          tool_input: {
            command:
              'gh --repo owner/one issue create --title "Plan: Workflow" --label plan --body-file plan-body.md',
            cwd: dir,
          },
        })?.reason,
      ).toContain('dev/plan-issue.mts create')
    })
  })

  it('requires the helper when raw gh omits the target repository', async () => {
    await withTestTempDir('voucha-plan-body-', async dir => {
      await writeFile(join(dir, 'plan-body.md'), VALID_PLAN_BODY)

      expect(
        findPreToolUseBlock({
          tool_input: {
            command:
              'gh issue create --title "Plan: Workflow" --label plan --body-file plan-body.md',
            cwd: dir,
          },
        })?.reason,
      ).toContain('dev/plan-issue.mts create')
    })
  })

  it('requires the helper before resolving an opaque body path', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command:
            'gh issue create --title "Plan: Workflow" --label plan --body-file $PLAN_TMP/body.md',
        },
      })?.reason,
    ).toContain('dev/plan-issue.mts create')
  })
})
