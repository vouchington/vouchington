import { describe, expect, it } from 'vitest'

import { scheduledPromptIndexViolations } from './scheduled-prompt-index-policy.mts'

const index =
  '[One](scheduled/one.md)\n[Two](scheduled/two.md)\n`ci/check-scheduled-prompt-index-policy.mts`'
const paths = ['docs/prompts/scheduled/one.md', 'docs/prompts/scheduled/two.md']

describe('scheduled prompt index', () => {
  it('accepts exactly the linked tracked prompt documents', () => {
    expect(scheduledPromptIndexViolations(index, paths)).toEqual([])
  })
  it('rejects an omitted prompt document', () => {
    expect(
      scheduledPromptIndexViolations(index, [...paths, 'docs/prompts/scheduled/three.md']),
    ).toEqual(['docs/prompts/SCHEDULED.md: index links differ from tracked scheduled prompts'])
  })
  it('requires the static checker marker', () => {
    expect(
      scheduledPromptIndexViolations('[One](scheduled/one.md)', ['docs/prompts/scheduled/one.md']),
    ).toEqual([
      'docs/prompts/SCHEDULED.md: missing static policy marker `ci/check-scheduled-prompt-index-policy.mts`',
    ])
  })
})
