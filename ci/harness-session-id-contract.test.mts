import { describe, expect, it, vi } from 'vitest'

import { dispatchHarnessSession } from './harness-session-dispatch.mts'
import { HARNESS_SESSION_ID, validateCheckpoint } from './shepherd-checkpoint.mts'

const valid = 'sess-0123abcd'

describe('Auto Harness session id contract', () => {
  it('matches the production sess-plus-four-random-bytes grammar', () => {
    expect(HARNESS_SESSION_ID.test(valid)).toBe(true)
    for (const invalid of [
      '.',
      '..',
      'sess-123',
      'sess-0123ABCD',
      '11111111-1111-4111-8111-111111111111',
    ]) {
      expect(HARNESS_SESSION_ID.test(invalid)).toBe(false)
    }
  })

  it('resumes a grammar-valid session with the default priority and no timeout', async () => {
    const bodies = new Map<string, unknown>()
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const route = `${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`
      if (init?.body !== undefined) bodies.set(route, JSON.parse(String(init.body)))
      return new Response(
        JSON.stringify({
          created: false,
          id: valid,
          url: `https://harness.example.com/sessions/${valid}`,
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      )
    })

    await expect(
      dispatchHarnessSession(
        {
          HARNESS_API_KEY: 'token',
          HARNESS_CONCURRENCY_ID: 'shepherd-9319',
          HARNESS_DISPATCH_ENABLED: 'true',
          HARNESS_PROMPT: 'continue',
          HARNESS_REPOSITORY_ID: 'repo-filaments',
          HARNESS_RESUME_SESSION_ID: valid,
          HARNESS_URL: 'https://harness.example.com',
        },
        fetchImplementation,
      ),
    ).resolves.toMatchObject({ id: valid })
    const resumeBody = bodies.get(`POST /api/v1/sessions/${valid}/resume`)
    expect(resumeBody).toMatchObject({ priority: 0 })
    expect(resumeBody).not.toHaveProperty('timeout')
  })

  it('rejects shepherd checkpoints whose session id breaks the grammar', () => {
    const checkpoint = {
      marker: 'shepherd-checkpoint:v1',
      repository: 'jonathanong/filaments',
      pr: 9319,
      headRef: 'agent/auto-harness-migration',
      startSha: 'a'.repeat(40),
      sessionStartSha: 'a'.repeat(40),
      runId: '31896700533',
      runUrl: 'https://github.com/jonathanong/filaments/actions/runs/31896700533',
      actor: 'github-actions[bot]',
      sessionId: valid,
      resumeSourceRunId: '',
      status: 'failed',
      createdAt: '2026-08-15T00:00:00Z',
      updatedAt: '2026-08-15T00:00:00Z',
    }
    expect(validateCheckpoint(checkpoint)?.sessionId).toBe(valid)
    for (const invalid of ['.', '..', 'sess-123', '11111111-1111-4111-8111-111111111111']) {
      expect(validateCheckpoint({ ...checkpoint, sessionId: invalid })).toBeUndefined()
    }
  })
})
