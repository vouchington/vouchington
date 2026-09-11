import { describe, expect, it } from 'vitest'

import { detectTranscriptSchema } from '../compute.mts'

function line(record: unknown): string {
  return JSON.stringify(record)
}

describe('detectTranscriptSchema', () => {
  it('detects Claude and Codex and rejects unknown or mixed records', () => {
    expect(detectTranscriptSchema([line({ type: 'user', message: { content: 'x' } })])).toEqual({
      schema: 'claude',
    })
    expect(
      detectTranscriptSchema([line({ type: 'event_msg', payload: { type: 'task_started' } })]),
    ).toEqual({ schema: 'codex' })
    expect(detectTranscriptSchema([line({ hello: 'world' })])).toEqual({
      error: 'unsupported transcript schema',
    })
    expect(
      detectTranscriptSchema([
        line({ type: 'user', message: { content: 'x' } }),
        line({ type: 'event_msg', payload: { type: 'task_started' } }),
      ]),
    ).toEqual({ error: 'mixed Claude and Codex transcript schemas' })
  })
})
