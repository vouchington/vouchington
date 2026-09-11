import { describe, expect, it, vi } from 'vitest'

import { dispatchHarnessSession } from './harness-session-dispatch.mts'
import { HARNESS_SESSION_ID, validateCheckpoint } from './shepherd-checkpoint.mts'

const valid = 'sess-0123abcd'

const baseEnvironment = {
  HARNESS_API_KEY: 'token',
  HARNESS_CONCURRENCY_ID: 'shepherd-9319',
  HARNESS_DISPATCH_ENABLED: 'true',
  HARNESS_PROMPT: 'continue',
  HARNESS_REPOSITORY_ID: 'repo-filaments',
  HARNESS_RESUME_SESSION_ID: valid,
  HARNESS_URL: 'https://harness.example.com',
}

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

  it('shares the same grammar across resume dispatch and shepherd checkpoints', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          concurrencyId: 'shepherd-9319',
          id: valid,
          repositoryId: 'repo-filaments',
          status: 'running',
          url: `https://harness.example.com/sessions/${valid}`,
        }),
        { status: 200 },
      ),
    )

    await expect(
      dispatchHarnessSession(baseEnvironment, fetchImplementation),
    ).resolves.toMatchObject({ id: valid })
    expect(fetchImplementation).toHaveBeenCalledTimes(1)

    await expect(
      dispatchHarnessSession(
        { ...baseEnvironment, HARNESS_RESUME_SESSION_ID: 'sess-123' },
        fetchImplementation,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESUME_SESSION_ID' })
    expect(fetchImplementation).toHaveBeenCalledTimes(1)

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
