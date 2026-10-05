import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCopyrightStatementOfReasons,
  type CopyrightStatementInput,
} from './statement-of-reasons.mts'
import { COPYRIGHT_EU_OUT_OF_COURT_BODIES_URL } from './statement-of-reasons-redress-wording.mts'
import { copyrightNotificationCopy } from './statement-of-reasons-wording.mts'

const ORIGIN = 'https://voucha.test'
const noticeId = crypto.randomUUID()
const targetUrl = 'https://example.test/post-image'
const explanation = 'Staff explanation sentinel.'
const base: CopyrightStatementInput = {
  audience: 'poster',
  event: 'restricted',
  noticeId,
  receivedAt: new Date('2026-10-05T23:30:00.000Z'),
  jurisdiction: 'us_dmca',
  legalBasis: 'copyright',
  targetUrls: [targetUrl],
  automatedDecision: false,
  aiGuidance: false,
  claimantHasAccount: true,
  explanation,
}
const JURISDICTIONS = ['us_dmca', 'eu_dsa', 'uk'] as const
const EVENTS = ['restricted', 'confirmed', 'not_accepted'] as const
const AUDIENCES = ['poster', 'claimant'] as const

function statement(overrides: Partial<CopyrightStatementInput>) {
  return buildCopyrightStatementOfReasons({ ...base, ...overrides })
}

describe('copyright statement wording', () => {
  beforeEach(() => {
    vi.stubEnv('SITE_ORIGIN', ORIGIN)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('copyright statement links and facts', () => {
    const matrix = JURISDICTIONS.flatMap(jurisdiction =>
      EVENTS.flatMap(event => AUDIENCES.map(audience => [jurisdiction, event, audience] as const)),
    )

    it.each(matrix)(
      'builds every %s %s %s route as an absolute sentence',
      (jurisdiction, event, audience) => {
        const { text } = statement({ jurisdiction, event, audience })

        expect(text).not.toMatch(/(^|\s)\/copyright\//)
        for (const url of text.match(new RegExp(`${ORIGIN}\\S*`, 'g')) ?? [])
          expect(url.endsWith('.')).toBe(true)
      },
    )

    it('writes a plain UTC date and labels each affected image for the poster', () => {
      const { text } = statement({ targetUrls: [targetUrl, 'https://example.test/second'] })

      expect(text).toContain(`copyright case ${noticeId}, received 5 October 2026, and was taken`)
      expect(text).toContain(
        `Affected image: ${targetUrl}\nAffected image: https://example.test/second`,
      )
      expect(text).not.toContain('2026-10-05')
    })

    it('points to the case page when no affected image is public', () => {
      const { text } = statement({ targetUrls: [] })

      expect(text).toContain(
        `The affected image is not publicly visible; your case page lists it: ${ORIGIN}/copyright/notices/${noticeId}.`,
      )
      expect(text).not.toContain('Affected image:')
    })

    it.each(JURISDICTIONS)(
      'keeps image URLs and the case page out of a %s notifier statement',
      jurisdiction => {
        const { text } = statement({ jurisdiction, audience: 'claimant' })

        expect(text).not.toContain('Affected image:')
        expect(text).not.toContain('not publicly visible')
        expect(text).not.toContain(targetUrl)
      },
    )

    it.each(['restricted', 'confirmed'] as const)(
      'drops the case-page pointer from a poster %s summary',
      event => {
        const [summary] = statement({ event }).text.split('\n\n')

        expect(summary).toContain(`copyright case ${noticeId}`)
        expect(summary).not.toContain('case page')
      },
    )
  })

  describe('copyright restriction scope and reasons', () => {
    it.each(JURISDICTIONS)(
      'states the %s restriction as hidden worldwide until an outcome restores it',
      jurisdiction => {
        for (const audience of AUDIENCES) {
          const { text } = statement({ jurisdiction, audience })
          expect(text).toContain(
            'We have hidden this image from all viewers worldwide. It has not been deleted. It stays hidden until a review, appeal, complaint or counter-notice outcome restores it.',
          )
          expect(text).not.toContain('Delivery of that restriction')
        }
      },
    )

    it('tells only a US poster the counter-notice restoration timing', () => {
      const timing = 'we restore the image 10 to 14 business days after we receive it'

      expect(statement({}).text).toContain(timing)
      expect(statement({}).text).toContain(
        'unless the notifier tells us they have filed a court action',
      )
      expect(statement({ audience: 'claimant' }).text).not.toContain(timing)
      expect(statement({ jurisdiction: 'eu_dsa' }).text).not.toContain(timing)
      expect(statement({ jurisdiction: 'uk' }).text).not.toContain(timing)
    })

    it.each(['restricted', 'confirmed'] as const)(
      'gives a US %s decision a templated reason and no staff text',
      event => {
        const { text, fields } = statement({ event })

        expect(text).toContain(
          'Legal ground: copyright infringement under 17 U.S.C. 106 and 501. We acted under the notice-and-takedown process in 17 U.S.C. 512(c).',
        )
        expect(text).toContain(
          'Why we decided this: We received a notice that identified a copyrighted work and this image, and a moderator found that the image matches that work.',
        )
        expect(text).not.toContain(explanation)
        expect(text).not.toContain('Public explanation')
        expect(fields.legalGround.citation).toBe('17 U.S.C. 106, 501 and 512(c)')
      },
    )

    it('does not claim a moderator found a match for an automatic provisional restriction', () => {
      const { text } = statement({ automatedDecision: true })

      expect(text).toContain(
        'Why we decided this: We received a notice that identified a copyrighted work and this image.',
      )
      expect(text).not.toContain('a moderator found')
      expect(text).toContain('The provisional restriction was imposed automatically.')
    })

    it.each([
      [
        'eu_dsa',
        'Legal ground: copyright infringement under the copyright law of the Member State concerned (Directive 2001/29/EC as implemented). We assessed the image as infringing.',
      ],
      [
        'uk',
        'Legal ground: copyright infringement under the Copyright, Designs and Patents Act 1988. We assessed the image as infringing.',
      ],
    ] as const)(
      'states the %s ground as a finding with the staff reason',
      (jurisdiction, ground) => {
        for (const event of ['restricted', 'confirmed'] as const) {
          const { text } = statement({ jurisdiction, event })
          expect(text).toContain(ground)
          expect(text).toContain(`Why we decided this: ${explanation}`)
          expect(text).not.toContain('Legal ground considered')
        }
      },
    )

    it.each([
      ['us_dmca', 'Legal ground: copyright infringement under 17 U.S.C. 512 (US DMCA).'],
      [
        'eu_dsa',
        'Legal ground considered: claimed copyright infringement under EU or Member State law, on a notice under Article 16 of the Digital Services Act.',
      ],
      ['uk', 'Legal ground considered: claimed copyright infringement under UK law.'],
    ] as const)(
      'keeps the neutral %s wording when no restriction is decided',
      (jurisdiction, ground) => {
        const { text } = statement({ jurisdiction, audience: 'claimant', event: 'not_accepted' })

        expect(text).toContain(ground)
        expect(text).not.toContain('We assessed the image as infringing')
      },
    )

    it.each(JURISDICTIONS)(
      'adds the repeat-infringer sentence to a confirmed %s poster statement only',
      jurisdiction => {
        const sentence = `A confirmed copyright restriction counts toward our repeat-infringer policy: ${ORIGIN}/copyright/repeat-infringer-policy.`

        expect(statement({ jurisdiction, event: 'confirmed' }).text).toContain(sentence)
        expect(statement({ jurisdiction, event: 'restricted' }).text).not.toContain(sentence)
        expect(
          statement({ jurisdiction, event: 'confirmed', audience: 'claimant' }).text,
        ).not.toContain(sentence)
      },
    )
  })

  describe('copyright statement redress routes', () => {
    it('describes each US poster route in one absolute line', () => {
      const { text } = statement({})

      expect(text).toContain(
        `Appeal (if you think we made a mistake): ${ORIGIN}/copyright/notices/${noticeId}/appeal.\nCounter-notice (if you believe the image was removed by mistake or misidentification; see the timing above): ${ORIGIN}/copyright/notices/${noticeId}/counter-notice.\nYou may seek judicial redress through a court.`,
      )
    })

    it('gives a US notifier the new-notice and designated-agent routes', () => {
      const { text } = statement({ audience: 'claimant', event: 'not_accepted' })

      expect(text).toContain(`New notice: ${ORIGIN}/copyright/notices/new.`)
      expect(text).toContain(`Designated agent: ${ORIGIN}/copyright/designated-agent.`)
      expect(text).toContain('You may file a new notice, contact the designated agent, or seek')
    })

    it.each(AUDIENCES)(
      'points a %s to the Commission list of certified EU dispute bodies',
      audience => {
        const { text } = statement({ jurisdiction: 'eu_dsa', audience })

        expect(text).toContain(
          `You can find certified out-of-court dispute settlement bodies on the European Commission's list: ${COPYRIGHT_EU_OUT_OF_COURT_BODIES_URL}.`,
        )
        expect(COPYRIGHT_EU_OUT_OF_COURT_BODIES_URL).toMatch(
          /^https:\/\/digital-strategy\.ec\.europa\.eu\//,
        )
      },
    )

    it('lists all three EU routes in the not-accepted notifier summary', () => {
      const [summary] = statement({
        jurisdiction: 'eu_dsa',
        audience: 'claimant',
        event: 'not_accepted',
      }).text.split('\n\n')

      expect(summary).toContain('internal complaint')
      expect(summary).toContain('certified out-of-court dispute settlement body')
      expect(summary).toContain('judicial redress through a court')
      expect(copyrightNotificationCopy('claimant_decision_notice', 'eu_dsa').body).toContain(
        'internal complaint',
      )
    })

    it.each(AUDIENCES)('lists only the court for a %s UK statement', audience => {
      for (const event of EVENTS) {
        const { text, fields } = statement({ jurisdiction: 'uk', audience, event })
        expect(fields.redress.every(route => route.key === 'court')).toBe(true)
        expect(text).not.toContain('out-of-court')
        expect(text).not.toContain('internal complaint')
      }
      expect(copyrightNotificationCopy('claimant_decision_notice', 'uk').body).not.toContain(
        'internal complaint',
      )
    })
  })
})
