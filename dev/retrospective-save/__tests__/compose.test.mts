import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RetrospectiveCompositionInput } from 'vouchington-tooling/agent-blackboard'

import { runCompose } from '../compose.mts'

describe('shared retrospective composition', () => {
  it('generates required markers without inventing unavailable evidence or architectural findings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'retrospective-composition-'))
    try {
      const file = join(directory, 'input.json')
      const input: RetrospectiveCompositionInput = {
        sessionId: 'thread-1',
        date: '2026-09-27',
        issues: [],
        prs: [],
        description: 'bounded session',
        repositories: ['vouchington/vouchington'],
        workOutcome: 'no-change',
        feedbackCoverage: { status: 'unavailable', sources: [], droppedCount: 0 },
        narrative: '# Retrospective\nNo substantive work.',
        facts: { status: 'unavailable', reason: 'repository evidence unavailable' },
        transcript: { status: 'unavailable', reason: 'runtime did not capture transcript' },
        tools: { status: 'none-observed', reason: 'no tool activity observed in journal' },
        architecture: { status: 'not-assessed', reason: 'no architecture work' },
      }
      await writeFile(file, JSON.stringify(input))
      const markdown = await runCompose(['--input', file])
      expect(markdown).toContain('=== Retrospective Facts ===')
      expect(markdown).toContain('=== Transcript Facts ===')
      expect(markdown).toContain('## CI Failures')
      expect(markdown).toContain('Work outcome: no-change')
      expect(markdown).toContain('Status: not assessed (no architecture work)')
      expect(markdown).toContain('Status: unavailable (runtime did not capture transcript)')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
