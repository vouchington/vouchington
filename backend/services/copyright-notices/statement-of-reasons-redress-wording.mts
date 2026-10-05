import { getSiteUrl } from '@modules/utils'
import { TERRITORIAL_COMPLAINT_WINDOW_MONTHS } from './territorial-fields.mts'
import type { CopyrightStatementFields } from './statement-of-reasons-types.mts'

/** The Commission's list of certified out-of-court dispute settlement bodies (DSA Article 21). */
export const COPYRIGHT_EU_OUT_OF_COURT_BODIES_URL =
  'https://digital-strategy.ec.europa.eu/en/policies/dsa-out-court-dispute-settlement'

export const COPYRIGHT_COURT_REDRESS_TEXT = 'You may seek judicial redress through a court.'

/** One route as `<label>: <absolute URL>.`, with an optional note on when to use it. */
export function copyrightRouteSentence(label: string, path: string, description?: string): string {
  return `${label}${description ? ` (${description})` : ''}: ${getSiteUrl(path)}.`
}

/** What a US notifier or intake sender can do next, with each route as its own absolute sentence. */
export function copyrightUsIntakeRoutesText(): string {
  return `You may file a new notice, contact the designated agent, or seek judicial redress through a court. ${copyrightRouteSentence('New notice', '/copyright/notices/new')} ${copyrightRouteSentence('Designated agent', '/copyright/designated-agent')}`
}

export function copyrightRedressText(redress: CopyrightStatementFields['redress']): string {
  return redress.map(copyrightRedressRouteText).join('\n')
}

function copyrightRedressRouteText(route: CopyrightStatementFields['redress'][number]): string {
  switch (route.key) {
    case 'court':
      return COPYRIGHT_COURT_REDRESS_TEXT
    case 'internal_complaint':
      return `You may submit an internal complaint within ${TERRITORIAL_COMPLAINT_WINDOW_MONTHS} months after you are informed of this decision. ${route.path ? copyrightRouteSentence('Internal complaint', route.path) : 'To submit a complaint, reply to this email.'}`
    case 'out_of_court_dispute_settlement':
      return `You may refer this decision to a certified out-of-court dispute settlement body under Article 21 of the Digital Services Act. You can find certified out-of-court dispute settlement bodies on the European Commission's list: ${COPYRIGHT_EU_OUT_OF_COURT_BODIES_URL}.`
    case 'appeal':
      return copyrightRouteSentence(route.label, route.path!, 'if you think we made a mistake')
    case 'counter_notice':
      return copyrightRouteSentence(
        route.label,
        route.path!,
        'if you believe the image was removed by mistake or misidentification; see the timing above',
      )
    default:
      return copyrightRouteSentence(route.label, route.path!)
  }
}
