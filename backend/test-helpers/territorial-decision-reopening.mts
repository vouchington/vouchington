import { read } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { copyrightCorrespondencePurpose } from '../services/copyright-notices/correspondence.mts'
import { copyrightStaffQueueKeysSql } from '../services/copyright-notices/read-models-staff-queue-sql.mts'
import type { PrivateUser } from '../services/users/types.mts'
import {
  receiveEuCopyrightNotice,
  receiveUkCopyrightNotice,
} from '../services/copyright-notices/index.mts'

export async function receiveTestTerritorialDecisionNotice(
  jurisdiction: 'eu_dsa' | 'uk',
  claimant: PrivateUser,
  hostedUseUrl: string,
): Promise<{ noticeId: string; contact: string; contentDescription: string; grounds: string }> {
  const request = {
    contact: `claimant-${crypto.randomUUID()}@example.test`,
    contentDescription: `Work ${crypto.randomUUID()}`,
    grounds: `Grounds ${crypto.randomUUID()}`,
    hostedUseUrl,
  }
  const receipt =
    jurisdiction === 'eu_dsa'
      ? await receiveEuCopyrightNotice(
          { user: claimant, identity: `user:${claimant.id}` },
          crypto.randomUUID(),
          {
            ...request,
            notifierName: `Notifier ${claimant.id}`,
            notifierEmail: request.contact,
            goodFaithStatement: true,
          },
        )
      : await receiveUkCopyrightNotice(
          { user: claimant, identity: `user:${claimant.id}` },
          crypto.randomUUID(),
          request,
        )
  return {
    noticeId: receipt.notice_id,
    contact: request.contact,
    contentDescription: request.contentDescription,
    grounds: request.grounds,
  }
}

export type TerritorialDecisionReopeningFacts = {
  decisions: Array<{
    id: string
    outcome: 'restrict' | 'no_action'
    assessment_id: string | null
    supersedes_decision_id: string | null
  }>
  submission_count: number
  assessment_count: number
  target_count: number
  restrictions: Array<{
    id: string
    lifted_at: Date | null
    human_review_action: 'confirm' | 'modify' | 'reverse' | null
  }>
  withhold_intent_count: number
  restore_intent_count: number
  operative_incident_count: number
  messages: Array<{
    delivery_kind: 'claimant_decision_notice' | 'poster_restriction_notice'
    recipient_role: 'claimant' | 'poster'
    recipient_user_id: string | null
    channel: 'in_app' | 'email'
    text: string
  }>
}

/** Reads the durable decision, restriction, incident, and statement evidence for one notice. */
export async function readTerritorialDecisionReopeningFacts(
  noticeId: string,
): Promise<TerritorialDecisionReopeningFacts> {
  const [{ rows: decisions }, { rows: counts }, { rows: restrictions }, { rows: deliveries }] =
    await Promise.all([
      read<TerritorialDecisionReopeningFacts['decisions'][number]>(sql`
        /* readTerritorialDecisionReopeningFacts:decisions */
        SELECT id, outcome, copyright_notice_submission_assessment_id AS assessment_id,
          supersedes_decision_id
        FROM copyright_territorial_decisions
        WHERE copyright_notice_id = ${noticeId}
        ORDER BY id
      `),
      read<{
        submission_count: number
        assessment_count: number
        target_count: number
        withhold_intent_count: number
        restore_intent_count: number
        operative_incident_count: number
      }>(sql`
        /* readTerritorialDecisionReopeningFacts:counts */
        SELECT
          (SELECT count(*)::integer FROM copyright_notice_submissions submission
            WHERE submission.copyright_notice_id = ${noticeId}) AS submission_count,
          (SELECT count(*)::integer FROM copyright_notice_submission_assessments assessment
            JOIN copyright_notice_submissions submission
              ON submission.id = assessment.copyright_notice_submission_id
            WHERE submission.copyright_notice_id = ${noticeId}) AS assessment_count,
          (SELECT count(*)::integer FROM copyright_notice_targets target
            WHERE target.copyright_notice_id = ${noticeId}) AS target_count,
          (SELECT count(*)::integer FROM copyright_notice_action_work_items intent
            WHERE intent.copyright_notice_id = ${noticeId} AND intent.action = 'withhold') AS withhold_intent_count,
          (SELECT count(*)::integer FROM copyright_notice_action_work_items intent
            WHERE intent.copyright_notice_id = ${noticeId} AND intent.action = 'restore') AS restore_intent_count,
          (SELECT count(*)::integer FROM copyright_repeat_infringer_incidents incident
            WHERE incident.copyright_notice_id = ${noticeId} AND incident.is_operative) AS operative_incident_count
      `),
      read<TerritorialDecisionReopeningFacts['restrictions'][number]>(sql`
        /* readTerritorialDecisionReopeningFacts:restrictions */
        SELECT restriction.id, restriction.lifted_at, restriction.human_review_action
        FROM copyright_restrictions restriction
        WHERE restriction.copyright_notice_id = ${noticeId}
        ORDER BY restriction.id
      `),
      read<{
        delivery_kind: TerritorialDecisionReopeningFacts['messages'][number]['delivery_kind']
        recipient_role: TerritorialDecisionReopeningFacts['messages'][number]['recipient_role']
        recipient_user_id: string | null
        channel: TerritorialDecisionReopeningFacts['messages'][number]['channel']
        correspondence_id: string
        body_ciphertext: string
      }>(sql`
        /* readTerritorialDecisionReopeningFacts:messages */
        SELECT DISTINCT intent.delivery_kind, intent.recipient_role, intent.recipient_user_id,
          intent.channel, correspondence.id AS correspondence_id, correspondence.body_ciphertext
        FROM copyright_notice_delivery_work_items intent
        JOIN copyright_notice_correspondence_messages correspondence
          ON correspondence.id = intent.copyright_notice_correspondence_message_id
        WHERE intent.copyright_notice_id = ${noticeId}
          AND intent.delivery_kind IN ('claimant_decision_notice', 'poster_restriction_notice')
        ORDER BY intent.delivery_kind, intent.recipient_role, correspondence.id
      `),
    ])
  const count = counts[0]
  if (!count) throw new Error(`Missing territorial decision facts for notice ${noticeId}`)
  return {
    decisions,
    ...count,
    restrictions,
    messages: deliveries.map(delivery => ({
      delivery_kind: delivery.delivery_kind,
      recipient_role: delivery.recipient_role,
      recipient_user_id: delivery.recipient_user_id,
      channel: delivery.channel,
      text: decryptSecret(
        delivery.body_ciphertext,
        copyrightCorrespondencePurpose(delivery.correspondence_id),
      ),
    })),
  }
}

/** Reads only the target notice's reasons from the production queue-key query. */
export async function readTerritorialDecisionReopeningQueueReasons(
  noticeId: string,
): Promise<string[]> {
  const { rows } = await read<{ reasons: string[] }>(
    sql`/* readTerritorialDecisionReopeningQueueReasons */`
      .append(copyrightStaffQueueKeysSql())
      .append(sql`SELECT reasons FROM queue_key WHERE id = ${noticeId}`),
  )
  return rows[0]?.reasons ?? []
}
