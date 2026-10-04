import { describe, expect, it } from 'vitest'
import {
  buildCopyrightStatementOfReasons,
  type CopyrightStatementInput,
} from './statement-of-reasons.mts'

const input: CopyrightStatementInput = {
  audience: 'claimant',
  event: 'restricted',
  noticeId: crypto.randomUUID(),
  receivedAt: new Date(),
  jurisdiction: 'eu_dsa',
  legalBasis: 'copyright',
  targetUrls: [],
  automatedDecision: false,
  aiGuidance: false,
  claimantHasAccount: false,
  explanation: 'Public explanation sentinel.',
}

const complaintPath = `/copyright/notices/${input.noticeId}/complaint`

describe('EU statement redress', () => {
  it.each(['restricted', 'confirmed'] as const)('offers the poster a complaint for %s', event => {
    const statement = buildCopyrightStatementOfReasons({ ...input, audience: 'poster', event })
    expect(statement.fields.redress).toEqual([
      { key: 'internal_complaint', label: 'Internal complaint', path: complaintPath },
      {
        key: 'out_of_court_dispute_settlement',
        label: 'Out-of-court dispute settlement',
        path: null,
      },
      { key: 'court', label: 'Judicial redress', path: null },
    ])
    expect(statement.text).toContain(complaintPath)
    expect(statement.text).toContain('within 6 months after you are informed')
    expect(statement.text).toContain('Article 21')
    expect(statement.text).toContain('judicial redress through a court')
    expect(statement.text).not.toContain('reply to this email')
  })

  it.each(['restricted', 'confirmed', 'reversed', 'not_accepted', 'restriction_ended'] as const)(
    'offers a guest notifier email complaint for %s',
    event => {
      const statement = buildCopyrightStatementOfReasons({
        ...input,
        event,
        restorationCause: 'complaint_reversed',
        restorationOutcome: 'visible',
      })
      expect(statement.fields.redress.map(route => route.key)).toEqual([
        'internal_complaint',
        'out_of_court_dispute_settlement',
        'court',
      ])
      expect(statement.text).toContain('reply to this email')
      expect(statement.text).toContain('within 6 months after you are informed')
      expect(statement.text).toContain('Article 21')
      expect(statement.text).not.toContain(complaintPath)
      expect(
        statement.fields.redress.find(route => route.key === 'internal_complaint')?.path,
      ).toBeNull()
      expect(JSON.stringify(statement.fields)).not.toContain(input.explanation)
      expect(statement.fields).not.toHaveProperty('claimantHasAccount')
    },
  )

  it.each(['restricted', 'confirmed', 'reversed', 'not_accepted', 'restriction_ended'] as const)(
    'offers a signed-in notifier case complaint for %s',
    event => {
      const statement = buildCopyrightStatementOfReasons({
        ...input,
        event,
        claimantHasAccount: true,
        restorationCause: 'complaint_reversed',
        restorationOutcome: 'visible',
      })
      expect(statement.text).toContain(complaintPath)
      expect(statement.text).not.toContain('reply to this email')
      expect(statement.fields.redress.find(route => route.key === 'internal_complaint')?.path).toBe(
        complaintPath,
      )
    },
  )

  it.each(['reversed', 'not_accepted', 'restriction_ended'] as const)(
    'offers no poster complaint for %s',
    event => {
      const statement = buildCopyrightStatementOfReasons({
        ...input,
        audience: 'poster',
        event,
        restorationCause: 'complaint_reversed',
        restorationOutcome: 'visible',
      })
      expect(statement.fields.redress).toEqual([])
      expect(statement.text).not.toContain('Article 21')
    },
  )

  it.each(['us_dmca', 'uk'] as const)('does not add EU routes for %s', jurisdiction => {
    const statement = buildCopyrightStatementOfReasons({ ...input, jurisdiction })
    expect(statement.fields.redress.map(route => route.key)).not.toContain('internal_complaint')
    expect(statement.fields.redress.map(route => route.key)).not.toContain(
      'out_of_court_dispute_settlement',
    )
    expect(statement.text).not.toContain('Article 21')
    expect(statement.text).not.toContain('reply to this email')
  })
})
