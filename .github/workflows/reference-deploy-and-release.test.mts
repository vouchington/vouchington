import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const alwaysRunMap = readFileSync(
  '.github/workflows/reference-workflow-automation-always-run.md',
  'utf8',
)

describe('deployment workflow inventory', () => {
  it('connects the shepherd command node to its workflow', () => {
    expect(alwaysRunMap).toContain('shepherd-comment --> shepherd["shepherd"]')
    expect(alwaysRunMap).not.toContain('pr-shepherd-comment --> shepherd')
  })
})
