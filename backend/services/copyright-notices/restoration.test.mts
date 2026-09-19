import { describe, expect, it } from 'vitest'
import { precheckCopyrightRestoration } from './restoration.mts'

describe('precheckCopyrightRestoration', () => {
  const window = {
    earliestRestorationAt: new Date('2026-07-15T04:00:00.000Z'),
    restorationDeadlineAt: new Date('2026-07-22T04:00:00.000Z'),
  }

  it('requires final human review and rejects a qualifying timely claimant court/CCB hold', () => {
    expect(
      precheckCopyrightRestoration({
        now: new Date('2026-07-16T04:00:00.000Z'),
        restrictionHumanReviewAt: new Date(),
        ...window,
        otherActiveRestrictionCount: 0,
        hold: {
          fromOriginalClaimant: true,
          commenced: true,
          sameMaterial: true,
          receivedByDesignatedAgentAt: new Date('2026-07-16T00:00:00.000Z'),
          proceedingKind: 'ccb',
        },
      }),
    ).toMatchObject({ eligible: false })
  })

  it('requires the statutory window and ignores an unsupported threat', () => {
    expect(
      precheckCopyrightRestoration({
        now: new Date('2026-07-16T04:00:00.000Z'),
        restrictionHumanReviewAt: new Date(),
        ...window,
        otherActiveRestrictionCount: 0,
        hold: {
          receivedByDesignatedAgentAt: new Date(),
          fromOriginalClaimant: true,
          commenced: false,
          sameMaterial: true,
          proceedingKind: 'federal_court',
        },
      }),
    ).toMatchObject({ eligible: true })
  })

  it.each([
    ['before day ten', new Date('2026-07-14T04:00:00.000Z'), new Date()],
    ['without human review', new Date('2026-07-16T04:00:00.000Z'), null],
  ])('rejects restoration %s', (_label, now, restrictionHumanReviewAt) => {
    expect(
      precheckCopyrightRestoration({
        now,
        restrictionHumanReviewAt,
        ...window,
        otherActiveRestrictionCount: 0,
        hold: null,
      }),
    ).toMatchObject({ eligible: false })
  })

  it('permits overdue restoration but marks it for escalation', () => {
    expect(
      precheckCopyrightRestoration({
        now: new Date('2026-07-23T04:00:00.000Z'),
        restrictionHumanReviewAt: new Date(),
        ...window,
        otherActiveRestrictionCount: 0,
        hold: null,
      }),
    ).toEqual({ eligible: true, overdue: true })
  })

  it.each([
    ['day ten', window.earliestRestorationAt],
    ['day fourteen', new Date('2026-07-21T04:00:00.000Z')],
  ])('permits an otherwise eligible restoration on the %s boundary', (_label, now) => {
    expect(
      precheckCopyrightRestoration({
        now,
        restrictionHumanReviewAt: new Date('2026-07-14T12:00:00.000Z'),
        ...window,
        otherActiveRestrictionCount: 0,
        hold: null,
      }),
    ).toEqual({ eligible: true, overdue: false })
  })

  it('keeps another independently active restriction in force', () => {
    expect(
      precheckCopyrightRestoration({
        now: window.earliestRestorationAt,
        restrictionHumanReviewAt: new Date('2026-07-14T12:00:00.000Z'),
        ...window,
        otherActiveRestrictionCount: 1,
        hold: null,
      }),
    ).toMatchObject({ eligible: false })
  })

  it.each([
    ['different claimant', false, true, true],
    ['uncommenced threat', true, false, true],
    ['different material', true, true, false],
  ])(
    'does not accept a %s as a statutory hold',
    (_label, fromOriginalClaimant, commenced, sameMaterial) => {
      expect(
        precheckCopyrightRestoration({
          now: window.earliestRestorationAt,
          restrictionHumanReviewAt: new Date('2026-07-14T12:00:00.000Z'),
          ...window,
          otherActiveRestrictionCount: 0,
          hold: {
            receivedByDesignatedAgentAt: new Date('2026-07-15T03:00:00.000Z'),
            fromOriginalClaimant,
            commenced,
            sameMaterial,
            proceedingKind: 'federal_court',
          },
        }),
      ).toMatchObject({ eligible: true })
    },
  )

  it('does not accept a proceeding notice received after restoration', () => {
    expect(
      precheckCopyrightRestoration({
        now: window.earliestRestorationAt,
        restrictionHumanReviewAt: new Date('2026-07-14T12:00:00.000Z'),
        ...window,
        otherActiveRestrictionCount: 0,
        hold: {
          fromOriginalClaimant: true,
          commenced: true,
          sameMaterial: true,
          receivedByDesignatedAgentAt: new Date('2026-07-15T05:00:00.000Z'),
          proceedingKind: 'ccb',
        },
      }),
    ).toMatchObject({ eligible: true })
  })
})
