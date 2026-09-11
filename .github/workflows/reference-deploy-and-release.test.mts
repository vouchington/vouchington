import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const automationMap = readFileSync('.github/workflows/reference-workflow-automation-map.md', 'utf8')

describe('deployment workflow inventory', () => {
  it('connects the shepherd command node to its workflow', () => {
    expect(automationMap).toContain('shepherd-comment --> shepherd["shepherd"]')
    expect(automationMap).not.toContain('pr-shepherd-comment --> shepherd')
  })
})
