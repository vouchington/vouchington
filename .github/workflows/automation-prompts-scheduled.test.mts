import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const scheduledPromptPaths = readdirSync('docs/prompts/scheduled')
  .filter(file => file.endsWith('.md'))
  .map(file => join('docs/prompts/scheduled', file))

describe('Harness scheduled automation prompt contracts', () => {
  it('keeps the scheduled prompt index synchronized with files', () => {
    const indexText = readFileSync('docs/prompts/SCHEDULED.md', 'utf8')
    const linkedPaths = [...indexText.matchAll(/\]\((scheduled\/[^)\s"]+\.md)\)/g)].map(
      match => `docs/prompts/${match[1]}`,
    )
    expect(linkedPaths.toSorted()).toEqual(scheduledPromptPaths.toSorted())
    expect(indexText).toContain('`automation-prompts-scheduled.test.mts`')
  })
})
