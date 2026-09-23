import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const promptText = readFileSync('docs/prompts/automation/shepherd.md', 'utf8')
const workflowText = readFileSync('.github/workflows/shepherd.yml', 'utf8')

// pr-shepherd's own --help prose (usage lines, flag descriptions) is third-party output with
// independent versioning; asserting it verbatim breaks CI whenever upstream rewords help text
// with no behavior change on our side. Assert only what this repository renders and requires.

describe('shepherd prompt contract', () => {
  it('renders the trusted binary version and forbids replacing the existing PR', () => {
    expect(workflowText).toContain('template: docs/prompts/automation/shepherd.md')
    expect(workflowText).toContain(
      'PR_SHEPHERD_VERSION=${{ steps.pr-shepherd-version.outputs.version }}',
    )
    expect(workflowText).toContain('PR_TITLE=pr-title.txt')
    expect(promptText).toContain('`./dev/initialize monorepo`')
    expect(promptText).toContain(
      'pr-shepherd {{PR_NUMBER}} --interval 60s --until-terminal --quiet-status',
    )
    expect(promptText).toContain('`pr-shepherd --version`')
    expect(promptText).toContain('`{{PR_SHEPHERD_VERSION}}`')
    expect(promptText).toContain('{{TRIGGER_COMMENT_ID}}')
    expect(promptText).toContain('## Root cause')
    expect(promptText).toContain('## Implementation choice')
    expect(promptText).toContain('## Options considered')
    expect(promptText).not.toMatch(/(?:\/goal update PR|\$pr-shepherd:pr-shepherd)/u)
  })
})
