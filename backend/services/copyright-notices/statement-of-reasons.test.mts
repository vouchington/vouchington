import { describe, expect, it } from 'vitest'
import { buildCopyrightStatementOfReasons } from './statement-of-reasons.mts'
import {
  COPYRIGHT_AI_ASSISTED_SENTENCE,
  copyrightNotificationCopy,
} from './statement-of-reasons-wording.mts'

const input = {
  audience: 'poster' as const,
  event: 'restricted' as const,
  noticeId: crypto.randomUUID(),
  receivedAt: new Date(),
  jurisdiction: 'us_dmca',
  legalBasis: 'copyright',
  targetUrls: ['https://example.test/image-a', 'https://example.test/image-b'],
  automatedDecision: false,
  aiGuidance: false,
  claimantHasAccount: true,
}

describe('copyright statements of reasons', () => {
  it.each(['restricted', 'confirmed'] as const)(
    'describes the %s restriction and offered redress',
    event => {
      const statement = buildCopyrightStatementOfReasons({ ...input, event })
      expect(statement.fields.restriction).toEqual({
        type: 'visibility_restriction',
        subject: 'image',
        deleted: false,
        scope: 'global',
      })
      expect(statement.fields.facts.basis).toBe('notice')
      expect(statement.fields.legalGround).toMatchObject({
        jurisdiction: 'us_dmca',
        legalBasis: 'copyright',
      })
      expect(statement.fields.redress.map(route => route.key)).toEqual([
        'appeal',
        'counter_notice',
        'court',
      ])
      expect(statement.text).toContain(input.noticeId)
      for (const url of input.targetUrls) expect(statement.text).toContain(url)
      expect(statement.inAppSummary.length).toBeLessThanOrEqual(1000)
    },
  )
  it.each(['reversed', 'restriction_ended'] as const)('offers no redress for %s', event => {
    const statement = buildCopyrightStatementOfReasons({
      ...input,
      event,
      restorationCause: 'review_reversed',
      restorationOutcome: 'still_hidden',
    })
    expect(statement.fields.redress).toEqual([])
    expect(statement.text).not.toContain('internal_complaint')
    expect(statement.text).not.toContain('out_of_court_dispute_settlement')
    expect(statement.inAppSummary.length).toBeLessThanOrEqual(1000)
  })
  it.each([
    ['visible', 'Restoration is authorized.'],
    ['still_hidden', 'Another restriction keeps the image hidden.'],
    ['unavailable', 'The image is unavailable.'],
  ] as const)(
    'states the %s restoration outcome without internal enums',
    (restorationOutcome, wording) => {
      const statement = buildCopyrightStatementOfReasons({
        ...input,
        event: 'restriction_ended',
        restorationCause: 'review_reversed',
        restorationOutcome,
      })
      expect(statement.text).toContain(wording)
      expect(statement.text).not.toContain('review_reversed')
      expect(statement.fields.redress).toEqual([])
    },
  )
  it('discloses an automatic provisional decision and assistance independently', () => {
    const statement = buildCopyrightStatementOfReasons({
      ...input,
      automatedDecision: true,
      aiGuidance: true,
    })
    expect(statement.fields.automation).toEqual({
      detection: false,
      decision: 'automatic_pending_review',
      aiGuidance: true,
    })
    expect(statement.text).toContain('person will review')
    expect(statement.text).toContain(COPYRIGHT_AI_ASSISTED_SENTENCE)
    expect(buildCopyrightStatementOfReasons(input).fields.automation).toEqual({
      detection: false,
      decision: 'person',
      aiGuidance: false,
    })
  })
  it.each([
    ['eu_dsa', 'the copyright law of the Member State concerned', 'DSA Article 16'],
    [
      'uk',
      'the Copyright, Designs and Patents Act 1988',
      'Copyright, Designs and Patents Act 1988',
    ],
  ] as const)(
    'uses %s copyright ground and jurisdiction redress',
    (jurisdiction, law, citation) => {
      for (const audience of ['poster', 'claimant'] as const) {
        for (const event of ['restricted', 'confirmed'] as const) {
          const statement = buildCopyrightStatementOfReasons({
            ...input,
            jurisdiction,
            audience,
            event,
            explanation: 'Sentinel public explanation from staff.',
          })
          expect(statement.fields.legalGround).toMatchObject({
            jurisdiction,
            citation: expect.stringContaining(citation),
          })
          expect(statement.text).toContain(law)
          expect(statement.text).toContain('Sentinel public explanation from staff.')
          expect(statement.fields.redress.map(route => route.key)).toEqual(
            jurisdiction === 'eu_dsa'
              ? ['internal_complaint', 'out_of_court_dispute_settlement', 'court']
              : ['court'],
          )
          expect(statement.text).toContain('judicial redress through a court')
          expect(statement.text).not.toContain('/copyright/notices/new')
          expect(statement.text).not.toContain('/copyright/designated-agent')
          expect(statement.text).not.toContain('/appeal')
          expect(statement.text).not.toContain('/counter-notice')
          expect(JSON.stringify(statement.fields)).not.toContain('Sentinel public explanation')
        }
      }
    },
  )
  it.each(['eu_dsa', 'uk'] as const)(
    'renders %s no-action explanation without US intake routes',
    jurisdiction => {
      const statement = buildCopyrightStatementOfReasons({
        ...input,
        jurisdiction,
        audience: 'claimant',
        event: 'not_accepted',
        targetUrls: [],
        explanation: 'Sentinel no-action explanation.',
      })
      expect(statement.fields.restriction).toBeNull()
      expect(statement.fields.redress.map(route => route.key)).toEqual(
        jurisdiction === 'eu_dsa'
          ? ['internal_complaint', 'out_of_court_dispute_settlement', 'court']
          : ['court'],
      )
      expect(statement.text).toContain('Sentinel no-action explanation.')
      expect(statement.text).not.toContain('/copyright/notices/new')
      expect(statement.text).not.toContain('/copyright/designated-agent')
      expect(JSON.stringify(statement.fields)).not.toContain('Sentinel no-action explanation.')
      expect(
        copyrightNotificationCopy('claimant_decision_notice', jurisdiction).body,
      ).not.toContain('/copyright/')
    },
  )
  it('rejects an unknown jurisdiction or legal basis', () => {
    expect(() => buildCopyrightStatementOfReasons({ ...input, jurisdiction: 'other' })).toThrow(
      'Unsupported copyright statement legal ground',
    )
    expect(() => buildCopyrightStatementOfReasons({ ...input, legalBasis: 'other' })).toThrow(
      'Unsupported copyright statement legal ground',
    )
  })
  it('uses complaint reversal cause and never carries a stale explanation', () => {
    for (const event of ['reversed', 'restriction_ended'] as const) {
      const statement = buildCopyrightStatementOfReasons({
        ...input,
        jurisdiction: 'eu_dsa',
        event,
        explanation: 'Sentinel stale explanation.',
        restorationCause: 'complaint_reversed',
        restorationOutcome: 'visible',
      })
      expect(statement.text).not.toContain('Sentinel stale explanation.')
      expect(JSON.stringify(statement.fields)).not.toContain('Sentinel stale explanation.')
      expect(statement.text.includes('a complaint reversed the decision')).toBe(
        event === 'restriction_ended',
      )
    }
  })
  it('keeps US statement and in-app copy unchanged when given an explanation', () => {
    const before = buildCopyrightStatementOfReasons(input)
    const after = buildCopyrightStatementOfReasons({
      ...input,
      explanation: 'Sentinel ignored US explanation.',
    })
    expect(after).toEqual(before)
    expect(copyrightNotificationCopy('claimant_decision_notice').body).toContain(
      '/copyright/designated-agent',
    )
  })
  it('provides notifier redress without exposing target URLs', () => {
    const statement = buildCopyrightStatementOfReasons({
      ...input,
      audience: 'claimant',
      event: 'not_accepted',
    })
    expect(statement.fields.restriction).toBeNull()
    expect(statement.fields.facts.targetUrls).toEqual([])
    expect(statement.fields.redress.map(route => route.key)).toEqual([
      'new_notice',
      'designated_agent',
      'court',
    ])
    expect(statement.text).not.toContain(input.targetUrls[0])
  })
  it('distinguishes deadline-driven restoration from human review and provisional automation', () => {
    const statement = buildCopyrightStatementOfReasons({
      ...input,
      event: 'restriction_ended',
      restorationCause: 'counter_notice_window',
      restorationOutcome: 'visible',
    })
    expect(statement.fields.automation.decision).toBe('automatic_deadline')
    expect(statement.text).toContain(
      'ended automatically when the counter-notice waiting period expired',
    )
    expect(statement.text).not.toContain('A person made this decision')
    expect(statement.text).not.toContain('A person will review it')
  })
  it.each(['restricted', 'confirmed'] as const)(
    'includes usable claimant reasons for %s without requiring a case page',
    event => {
      const statement = buildCopyrightStatementOfReasons({ ...input, audience: 'claimant', event })
      expect(statement.inAppSummary).not.toContain('case page')
      expect(statement.text).toContain('reasons and redress routes are included in this notice')
      expect(statement.text).toContain('/copyright/designated-agent')
      expect(statement.text).toContain('judicial redress through a court')
    },
  )
})
