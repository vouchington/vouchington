import { getSiteUrl } from '@modules/utils'
import {
  copyrightStatementLegalGround,
  copyrightUsDecisionReason,
} from './statement-of-reasons-legal-ground.mts'
import { copyrightRedressText } from './statement-of-reasons-redress-wording.mts'
import { copyrightStatementSummary } from './statement-of-reasons-summary.mts'
import type {
  CopyrightStatementInput,
  CopyrightStatementFields,
} from './statement-of-reasons-types.mts'

export { copyrightNotificationCopy } from './statement-of-reasons-notification-copy.mts'
export {
  copyrightEmailSubject,
  copyrightIntakeRejectionText,
  copyrightNeedsInformationText,
} from './statement-of-reasons-email-wording.mts'
export { copyrightStatementSummary } from './statement-of-reasons-summary.mts'

export const COPYRIGHT_AI_ASSISTED_SENTENCE = 'Automated tools assisted with processing this case.'

export function copyrightReceiptText(noticeId?: string): string {
  return `We received your copyright notice${noticeId ? ` for case ${noticeId}` : ''}. We will review it and contact you if we need more information.`
}

/** A signed-in notifier complains on the case page; a guest replies to the decision email. */
export function copyrightEuReceiptText(noticeId: string, signedIn: boolean): string {
  const complaint = signedIn
    ? `use the complaint link on your case page: ${getSiteUrl(`/copyright/notices/${noticeId}`)}`
    : 'reply to the decision email to file a complaint'
  return `We received your EU copyright notice for case ${noticeId}. A moderator will decide whether to restrict the material. We will send the decision by email. You may complain about the decision within six months after we inform you; ${complaint}. You may also seek out-of-court dispute settlement or judicial redress.`
}

export function copyrightPromotionText(noticeId: string): string {
  return `Your emailed copyright notice is now case ${noticeId}. We will review it and contact you if we need more information.`
}

export function copyrightStatementText(
  input: CopyrightStatementInput,
  fields: CopyrightStatementFields,
): string {
  const decided = input.event === 'restricted' || input.event === 'confirmed'
  const ground = copyrightStatementLegalGround(input.jurisdiction)
  const automation =
    fields.automation.decision === 'automatic_deadline'
      ? 'The restriction ended automatically when the counter-notice waiting period expired.'
      : fields.automation.decision === 'automatic_pending_review'
        ? 'The provisional restriction was imposed automatically. A person will review it.'
        : 'A person made this decision.'
  const assistance = input.aiGuidance
    ? COPYRIGHT_AI_ASSISTED_SENTENCE
    : 'Automated tools did not assist with processing this case.'
  return [
    copyrightStatementSummary(input),
    fields.restriction ? copyrightScopeText(input) : '',
    copyrightFactsText(input, fields),
    automation,
    'Automated detection was not used.',
    assistance,
    decided ? ground.decisionText : ground.text,
    copyrightReasonText(input, decided),
    input.audience === 'poster' && input.event === 'confirmed'
      ? copyrightRepeatInfringerText()
      : '',
    copyrightRedressText(fields.redress),
  ]
    .filter(Boolean)
    .join('\n\n')
}

function copyrightScopeText(input: CopyrightStatementInput): string {
  const scope =
    'We have hidden this image from all viewers worldwide. It has not been deleted. It stays hidden until a review, appeal, complaint or counter-notice outcome restores it.'
  return input.audience === 'poster' && input.jurisdiction === 'us_dmca'
    ? `${scope} If you send a valid counter-notice, we restore the image 10 to 14 business days after we receive it, unless the notifier tells us they have filed a court action.`
    : scope
}

/** A plain UTC date, a labelled URL per affected image, and the case page when none is public. */
function copyrightFactsText(
  input: CopyrightStatementInput,
  fields: CopyrightStatementFields,
): string {
  const received = input.receivedAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const facts = [
    `This decision concerns copyright case ${input.noticeId}, received ${received}, and was taken in response to a notice.`,
  ]
  if (input.audience !== 'poster') return facts[0]!
  if (fields.facts.targetUrls.length === 0)
    facts.push(
      `The affected image is not publicly visible; your case page lists it: ${getSiteUrl(`/copyright/notices/${input.noticeId}`)}.`,
    )
  for (const url of fields.facts.targetUrls) facts.push(`Affected image: ${url}`)
  return facts.join('\n')
}

/** US decisions print a template. EU and UK decisions print the staff reason, never the US one. */
function copyrightReasonText(input: CopyrightStatementInput, decided: boolean): string {
  if (input.jurisdiction === 'us_dmca')
    return decided
      ? `Why we decided this: ${copyrightUsDecisionReason(input.automatedDecision)}`
      : ''
  return (decided || input.event === 'not_accepted') && input.explanation
    ? `Why we decided this: ${input.explanation}`
    : ''
}

function copyrightRepeatInfringerText(): string {
  return `A confirmed copyright restriction counts toward our repeat-infringer policy: ${getSiteUrl('/copyright/repeat-infringer-policy')}.`
}
