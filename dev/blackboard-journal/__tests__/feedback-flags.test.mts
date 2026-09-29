import { describe, expect, it } from 'vitest'

import { resolveFeedbackFlags, type FeedbackFlagInput } from '../feedback-flags.mts'

const required = {
  mode: 'autonomous',
  sourceEventId: 'event-1',
  workOutcome: 'in-progress',
  coverageStatus: 'partial',
}

describe('resolveFeedbackFlags', () => {
  it('defaults omitted coverage details and omits the outbox', () => {
    expect(resolveFeedbackFlags(required)).toEqual({
      mode: 'autonomous',
      sourceEventId: 'event-1',
      workOutcome: 'in-progress',
      feedbackCoverage: { status: 'partial', sources: [], droppedCount: 0 },
    })
    expect(
      resolveFeedbackFlags({ ...required, droppedCount: '0' }).feedbackCoverage.droppedCount,
    ).toBe(0)
  })

  it('splits coverage sources and keeps an explicit outbox and count', () => {
    expect(
      resolveFeedbackFlags({
        ...required,
        mode: 'interactive',
        coverageSource: 'ci,local',
        droppedCount: '2',
        outboxDirectory: '/tmp/outbox',
      }),
    ).toEqual({
      mode: 'interactive',
      sourceEventId: 'event-1',
      workOutcome: 'in-progress',
      feedbackCoverage: { status: 'partial', sources: ['ci', 'local'], droppedCount: 2 },
      outboxDirectory: '/tmp/outbox',
    })
  })

  it.each<[string, FeedbackFlagInput, string]>([
    ['mode', { ...required, mode: 'batch' }, '--mode must be one of:'],
    ['missing mode', { ...required, mode: undefined }, '--mode must be one of:'],
    ['source event', { ...required, sourceEventId: undefined }, '--source-event-id is required'],
    ['outcome', { ...required, workOutcome: 'done' }, '--work-outcome must be one of:'],
    ['coverage', { ...required, coverageStatus: undefined }, '--coverage-status must be one of:'],
    [
      'negative count',
      { ...required, droppedCount: '-1' },
      '--dropped-count must be a non-negative integer',
    ],
    [
      'fractional count',
      { ...required, droppedCount: '1.5' },
      '--dropped-count must be a non-negative integer',
    ],
    [
      'padded count',
      { ...required, droppedCount: '01' },
      '--dropped-count must be a non-negative integer',
    ],
    [
      'unsafe count',
      { ...required, droppedCount: '9007199254740993' },
      '--dropped-count must be a non-negative integer',
    ],
  ])('rejects a bad %s', (_label, input, message) => {
    expect(() => resolveFeedbackFlags(input)).toThrow(message)
  })
})
