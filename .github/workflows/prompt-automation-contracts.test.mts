import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const automationPromptPaths = readdirSync('docs/prompts/automation').flatMap(file =>
  file.endsWith('.md') && file !== 'README.md' ? [join('docs/prompts/automation', file)] : [],
)

describe('Codex automation prompt contracts', () => {
  it('does not embed the CI-mode preamble (injected at render time)', () => {
    for (const path of automationPromptPaths) {
      const text = readFileSync(path, 'utf8')
      expect(text).not.toContain('## CI mode')
    }
  })
})
