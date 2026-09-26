import { describe, it, expect } from 'vitest'
import { parseCreateModerationReportInput } from '../parse.mts'

describe('parseCreateModerationReportInput', () => {
  it('rejects raw notes longer than the stored limit', () => {
    expect(() =>
      parseCreateModerationReportInput({
        entityType: 'post',
        entityId: crypto.randomUUID(),
        reason: 'other',
        note: `${' '.repeat(1000)}x`,
      }),
    ).toThrow('Note must be 1000 characters or fewer')
  })

  it('rejects non-string notes with the existing validation message', () => {
    expect(() =>
      parseCreateModerationReportInput({
        entityType: 'post',
        entityId: crypto.randomUUID(),
        reason: 'other',
        note: 42,
      }),
    ).toThrow('Invalid note')
  })

  it('preserves cross-field validation precedence over note validation', () => {
    expect(() =>
      parseCreateModerationReportInput({
        entityType: 'user',
        entityId: crypto.randomUUID(),
        reason: 'vote_manipulation',
        note: `${' '.repeat(1000)}x`,
      }),
    ).toThrow('vote_manipulation reason is only valid for posts')
  })

  it('does not replace unexpected input-access errors with validation errors', () => {
    const failure = new Error('input access failed')
    const raw = {
      get entityType(): never {
        throw failure
      },
    }

    expect(() => parseCreateModerationReportInput(raw)).toThrow(failure)
  })
})
