import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const automationPromptPaths = readdirSync('docs/prompts/automation').flatMap(file =>
  file.endsWith('.md') ? [join('docs/prompts/automation', file)] : [],
)

describe('Codex automation prompt contracts', () => {
  it('does not embed the CI-mode preamble (injected at render time)', () => {
    for (const path of automationPromptPaths) {
      const text = readFileSync(path, 'utf8')
      expect(text).not.toContain('## CI mode')
    }
  })

  it('requires explanation sections in templates that create or update fixes', () => {
    const fixPromptPaths = automationPromptPaths.filter(
      path => !path.endsWith('plan.md') && !path.endsWith('scheduled-issue.md'),
    )
    for (const path of fixPromptPaths) {
      const text = readFileSync(path, 'utf8')
      const normalized = text.replace(/\s+/gu, ' ')
      expect(text).toContain('## Root cause')
      expect(text).toContain('## Implementation choice')
      expect(text).toContain('## Options considered')
      expect(text).toContain('pros')
      expect(normalized).toContain('implementation details')
    }
  })
})
