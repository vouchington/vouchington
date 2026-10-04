import type { CopyrightStatementFields } from './statement-of-reasons-types.mts'

/** Closed legal-ground wording; counsel reviews the EU/UK phrasing before approval. */
export function copyrightStatementLegalGround(jurisdiction: string): {
  fields: CopyrightStatementFields['legalGround']
  text: string
} {
  switch (jurisdiction) {
    case 'us_dmca':
      return {
        fields: { jurisdiction, legalBasis: 'copyright', citation: '17 U.S.C. 512' },
        text: 'Legal ground: copyright infringement under 17 U.S.C. 512 (US DMCA).',
      }
    case 'eu_dsa':
      return {
        fields: {
          jurisdiction,
          legalBasis: 'copyright',
          citation: 'DSA Article 16; applicable EU or Member State copyright law',
        },
        text: 'Legal ground considered: claimed copyright infringement under EU or Member State law, on a notice under Article 16 of the Digital Services Act.',
      }
    case 'uk':
      return {
        fields: { jurisdiction, legalBasis: 'copyright', citation: 'UK copyright law' },
        text: 'Legal ground considered: claimed copyright infringement under UK law.',
      }
    default:
      throw new Error('Unsupported copyright statement legal ground')
  }
}
