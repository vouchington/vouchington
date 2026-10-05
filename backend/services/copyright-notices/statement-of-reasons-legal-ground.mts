import type { CopyrightStatementFields } from './statement-of-reasons-types.mts'

/**
 * Closed legal-ground wording, approved by the owner after AI advisor review (#1230). A restrict or
 * confirm decision states the ground as a finding (`decisionText`); every other event keeps the
 * neutral `text`.
 */
export function copyrightStatementLegalGround(jurisdiction: string): {
  fields: CopyrightStatementFields['legalGround']
  text: string
  decisionText: string
} {
  switch (jurisdiction) {
    case 'us_dmca':
      return {
        fields: {
          jurisdiction,
          legalBasis: 'copyright',
          citation: '17 U.S.C. 106, 501 and 512(c)',
        },
        text: 'Legal ground: copyright infringement under 17 U.S.C. 512 (US DMCA).',
        decisionText:
          'Legal ground: copyright infringement under 17 U.S.C. 106 and 501. We acted under the notice-and-takedown process in 17 U.S.C. 512(c).',
      }
    case 'eu_dsa':
      return {
        fields: {
          jurisdiction,
          legalBasis: 'copyright',
          citation:
            'DSA Article 16; Directive 2001/29/EC as implemented by the Member State concerned',
        },
        text: 'Legal ground considered: claimed copyright infringement under EU or Member State law, on a notice under Article 16 of the Digital Services Act.',
        decisionText:
          'Legal ground: copyright infringement under the copyright law of the Member State concerned (Directive 2001/29/EC as implemented). We assessed the image as infringing.',
      }
    case 'uk':
      return {
        fields: {
          jurisdiction,
          legalBasis: 'copyright',
          citation: 'Copyright, Designs and Patents Act 1988',
        },
        text: 'Legal ground considered: claimed copyright infringement under UK law.',
        decisionText:
          'Legal ground: copyright infringement under the Copyright, Designs and Patents Act 1988. We assessed the image as infringing.',
      }
    default:
      throw new Error('Unsupported copyright statement legal ground')
  }
}

/**
 * The reason a US decision prints in place of staff text. An automatic provisional restriction has
 * no moderator finding yet, so it states only what the notice identified.
 */
export function copyrightUsDecisionReason(automatedDecision: boolean): string {
  const received = 'We received a notice that identified a copyrighted work and this image'
  return automatedDecision
    ? `${received}.`
    : `${received}, and a moderator found that the image matches that work.`
}
