import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8')

describe('planning skill contract', () => {
  it('retains planning discovery and native skill metadata', () => {
    const impact = read('.agents/skills/planning/references/impact-discovery.md')
    const metadata = read('.agents/skills/planning/agents/openai.yaml')
    expect(impact).toContain('pnpm exec no-mistakes planning-impact')
    expect(metadata).toMatch(/default_prompt:.*\$planning\b/)
  })
})
