import { describe, expect, it } from 'vitest'

import { createEmptyFacts } from '../../retrospective-transcript-facts/compute-shared.mts'
import { renderCompactNote, renderFailureNote, renderMilestoneNote } from '../note.mts'

describe('renderCompactNote', () => {
  it('renders a heading, the transcript path, and the formatted facts block', () => {
    const facts = { ...createEmptyFacts(), toolCalls: 5, userPrompts: 2 }
    const markdown = renderCompactNote('sess-1', '/path/to/transcript.jsonl', facts)

    expect(markdown).toContain('## Auto-append: post-compaction checkpoint')
    expect(markdown).toContain('Transcript: /path/to/transcript.jsonl')
    expect(markdown).toContain('=== Transcript Facts ===')
    expect(markdown).toContain('Session: sess-1')
    expect(markdown).toContain('Tool calls: 5 (failed: 0)')
    expect(markdown).toContain('User prompts: 2')
  })

  it('falls back to "unavailable" for a blank transcript path', () => {
    const markdown = renderCompactNote('sess-1', '', createEmptyFacts())
    expect(markdown).toContain('Transcript: unavailable')
  })
})

describe('renderFailureNote', () => {
  it('numbers each tracked failure and indents its stderr head as a blockquote', () => {
    const markdown = renderFailureNote(3, [
      { command: 'npx vitest run a', stderrHead: 'FAIL a.test.mts' },
      { command: 'npx vitest run b', stderrHead: 'FAIL b.test.mts' },
      { command: 'npx vitest run c', stderrHead: 'line one\nline two' },
    ])

    expect(markdown).toContain('## Auto-append: repeated command failure (failure #3)')
    expect(markdown).toContain('Last 3 tracked high-signal command failure(s):')
    expect(markdown).toContain('1. `npx vitest run a`')
    expect(markdown).toContain('> FAIL a.test.mts')
    expect(markdown).toContain('2. `npx vitest run b`')
    expect(markdown).toContain('3. `npx vitest run c`')
    expect(markdown).toContain('> line one')
    expect(markdown).toContain('> line two')
  })
})

describe('renderMilestoneNote', () => {
  it('labels a pr-create milestone and indents the evidence', () => {
    const markdown = renderMilestoneNote(
      'gh pr create --title x --body y',
      'pr-create',
      'https://github.com/vouchington/vouchington/pull/9358',
    )

    expect(markdown).toContain('## Auto-append: PR created')
    expect(markdown).toContain('Command: `gh pr create --title x --body y`')
    expect(markdown).toContain('> https://github.com/vouchington/vouchington/pull/9358')
  })

  it('labels a push milestone', () => {
    const markdown = renderMilestoneNote(
      'git push',
      'push',
      'abc123..def456  my-branch -> my-branch',
    )

    expect(markdown).toContain('## Auto-append: Pushed')
    expect(markdown).toContain('Command: `git push`')
    expect(markdown).toContain('> abc123..def456  my-branch -> my-branch')
  })
})
