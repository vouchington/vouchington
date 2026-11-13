import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
export async function getDisclosureIntent(
  noticeId: string,
  submissionId: string,
  deliveryKind: string,
  channel: string,
  latest = false,
) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const matching =
    aggregate?.deliveryIntents.filter(
      row =>
        row.copyright_notice_submission_id === submissionId &&
        row.delivery_kind === deliveryKind &&
        row.channel === channel,
    ) ?? []
  const intent = latest ? matching.at(-1) : matching[0]
  if (!intent) throw new Error(`Missing ${deliveryKind} ${channel} intent`)
  return intent
}
