import { describe, expect, it } from 'vitest'
import { parseCleanupAbandonedUploadsData } from './upload-cleanup.mts'

const key = { stagedAt: '2026-01-01T00:00:00.000001Z', id: '019b76da-a800-7000-8000-000000000002' }
const empty = { upper: null, done: true }
const snapshot = {
  recoveryCutoff: '2026-01-02T00:00:00.000000Z',
  abandonmentCutoff: '2026-01-01T01:00:00.000000Z',
  windows: { staged: { upper: key, done: false }, recovery: empty, abandonment: empty },
}

describe('upload cleanup retained payload', () => {
  it('accepts only an empty root or validated retained progress without losing microseconds', () => {
    expect(parseCleanupAbandonedUploadsData({})).toEqual({})
    expect(parseCleanupAbandonedUploadsData({ sweep: snapshot })).toEqual({ sweep: snapshot })
  })

  it.each([
    undefined,
    null,
    [],
    { imageIds: [] },
    { sweep: undefined },
    { sweep: { ...snapshot, extra: true } },
    { sweep: { ...snapshot, recoveryCutoff: '2026-02-31T00:00:00.000000Z' } },
    { sweep: { ...snapshot, recoveryCutoff: key.stagedAt } },
    {
      sweep: {
        ...snapshot,
        windows: { ...snapshot.windows, staged: { upper: key, done: false, extra: true } },
      },
    },
    { sweep: { ...snapshot, recoveryCutoff: 'invalid' } },
    {
      sweep: {
        ...snapshot,
        windows: { ...snapshot.windows, staged: { upper: null, done: false } },
      },
    },
    {
      sweep: {
        ...snapshot,
        windows: {
          ...snapshot.windows,
          staged: {
            upper: key,
            done: false,
            after: { ...key, id: '019b76da-a800-7000-8000-000000000003' },
          },
        },
      },
    },
  ])('rejects invalid progress instead of silently starting a global sweep: %j', value => {
    expect(() => parseCleanupAbandonedUploadsData(value)).toThrow(
      /^(?:Upload cleanup requires an object payload|Invalid upload cleanup (?:payload|snapshot|window|cursor range|key))$/u,
    )
  })
})
