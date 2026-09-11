import { describe, expect, it } from 'vitest'

import { resolveModelFromTranscript } from '../provenance-model.mts'

function claudeLine(model: string, isSidechain = false): string {
  return JSON.stringify({ isSidechain, message: { model }, type: 'assistant' })
}

function codexLine(model: string): string {
  return JSON.stringify({ payload: { model }, type: 'turn_context' })
}

async function* asAsyncLines(lines: string[]): AsyncGenerator<string> {
  yield* lines
}

function deps(lines: string[]) {
  return {
    openTranscriptLines: () => Promise.resolve({ lines: asAsyncLines(lines) }),
    resolveTranscriptFile: () => ({ path: '/fake/transcript.jsonl', sessionId: 'abc123' }),
  }
}

describe('resolveModelFromTranscript', () => {
  it('returns the last non-sidechain assistant message model for Claude transcripts', async () => {
    const lines = [claudeLine('claude-haiku'), claudeLine('claude-sonnet-5')]
    const model = await resolveModelFromTranscript('claude-code', 'abc123', deps(lines))
    expect(model).toBe('claude-sonnet-5')
  })

  it('ignores sidechain (subagent) assistant records for Claude transcripts', async () => {
    const lines = [claudeLine('claude-sonnet-5'), claudeLine('subagent-model', true)]
    const model = await resolveModelFromTranscript('claude-code', 'abc123', deps(lines))
    expect(model).toBe('claude-sonnet-5')
  })

  it('ignores unsupported records around a Claude assistant model', async () => {
    const model = await resolveModelFromTranscript(
      'claude-code',
      'abc123',
      deps([JSON.stringify({ type: 'system' }), claudeLine('claude-sonnet-5')]),
    )
    expect(model).toBe('claude-sonnet-5')
  })

  it('returns the last turn_context payload model for Codex transcripts', async () => {
    const lines = [codexLine('gpt-5-codex-mini'), codexLine('gpt-5-codex')]
    const model = await resolveModelFromTranscript('codex', 'abc123', deps(lines))
    expect(model).toBe('gpt-5-codex')
  })

  it('returns undefined when the detected schema does not match the requested harness', async () => {
    const lines = [codexLine('gpt-5-codex')]
    const model = await resolveModelFromTranscript('claude-code', 'abc123', deps(lines))
    expect(model).toBeUndefined()
  })

  it('returns undefined when transcript file resolution fails', async () => {
    const model = await resolveModelFromTranscript('claude-code', 'abc123', {
      resolveTranscriptFile: () => ({ error: 'no transcript found' }),
    })
    expect(model).toBeUndefined()
  })

  it('returns undefined when the transcript file cannot be read', async () => {
    const model = await resolveModelFromTranscript('claude-code', 'abc123', {
      openTranscriptLines: () => Promise.resolve({ error: 'ENOENT' }),
      resolveTranscriptFile: () => ({ path: '/fake/transcript.jsonl', sessionId: 'abc123' }),
    })
    expect(model).toBeUndefined()
  })

  it('returns undefined when the transcript has no recognizable schema', async () => {
    const model = await resolveModelFromTranscript(
      'claude-code',
      'abc123',
      deps(['not valid json']),
    )
    expect(model).toBeUndefined()
  })

  it('does not read a transcript for the grok harness', async () => {
    let resolved = false
    const model = await resolveModelFromTranscript('grok', 'abc123', {
      resolveTranscriptFile: () => {
        resolved = true
        return { path: '/fake/transcript.jsonl', sessionId: 'abc123' }
      },
    })
    expect(model).toBeUndefined()
    expect(resolved).toBe(false)
  })

  it('does not read a transcript for the cursor harness', async () => {
    let resolved = false
    const model = await resolveModelFromTranscript('cursor', 'abc123', {
      resolveTranscriptFile: () => {
        resolved = true
        return { path: '/fake/transcript.jsonl', sessionId: 'abc123' }
      },
    })
    expect(model).toBeUndefined()
    expect(resolved).toBe(false)
  })

  it('returns undefined when no assistant record carries a model', async () => {
    const lines = [JSON.stringify({ isSidechain: false, message: {}, type: 'assistant' })]
    const model = await resolveModelFromTranscript('claude-code', 'abc123', deps(lines))
    expect(model).toBeUndefined()
  })
})
