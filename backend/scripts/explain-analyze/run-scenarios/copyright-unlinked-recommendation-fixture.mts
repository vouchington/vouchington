import { beginTransaction } from '@data-stores/psql'
import { DEFAULT_DATA_RETENTION_CONFIG } from '@services/data-retention/config'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'

export const recommendationRelation = 'copyright_notice_email_intake_recommendations'
export const reviewRelation = 'copyright_notice_email_intake_reviews'
export const recommendationPageSize = DEFAULT_DATA_RETENTION_CONFIG.batch_size
export const recommendationRetentionSetting = 'app.copyright_operational_retention'
export const enableRecommendationRetention = `/* enableUnlinkedRecommendationFixtureRetention */ SET LOCAL ${recommendationRetentionSetting} = 'on'`

const anchor = new Date(postSeedTimestampMs(0))
const priorMonth = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1, 1)
export const targetReceipt = seedUuidAtTimestamp(priorMonth, 1_370_000)
export const crossMonthReceipt = seedUuidAtTimestamp(priorMonth, 1_370_001)
const otherReceipts = Array.from({ length: 200 }, (_, index) =>
  seedUuidAtTimestamp(anchor.getTime(), 1_371_000 + index),
)
const receiptIds = [targetReceipt, crossMonthReceipt, ...otherReceipts]
export const targetRecommendations = Array.from(
  { length: recommendationPageSize + 2 },
  (_, index) => seedUuidAtTimestamp(anchor.getTime(), 1_381_000 + index),
)
// A later review can protect an older recommendation; an unreviewed payload in the
// same earlier partition must still be removed along with the anchor-month payload.
export const crossMonthRecommendations = [
  seedUuidAtTimestamp(priorMonth, 1_380_000),
  seedUuidAtTimestamp(priorMonth, 1_380_001),
  seedUuidAtTimestamp(anchor.getTime(), 1_380_002),
]
const recommendationCountPerOtherReceipt = 10
export const unrelatedRecommendations = Array.from(
  { length: otherReceipts.length * recommendationCountPerOtherReceipt },
  (_, index) => seedUuidAtTimestamp(anchor.getTime(), 1_390_000 + index),
)
export const targetReview = seedUuidAtTimestamp(anchor.getTime(), 1_400_000)
export const crossMonthReview = seedUuidAtTimestamp(anchor.getTime(), 1_400_001)
const reviewIds = [
  targetReview,
  crossMonthReview,
  ...otherReceipts.map((_, index) => seedUuidAtTimestamp(anchor.getTime(), 1_401_000 + index)),
]
const reviewedRecommendations = [
  targetRecommendations[0]!,
  crossMonthRecommendations[0]!,
  ...otherReceipts.map((_, index) =>
    index % 2 === 0 ? unrelatedRecommendations[index * recommendationCountPerOtherReceipt]! : null,
  ),
]
const recommendationIds = [
  ...targetRecommendations,
  ...crossMonthRecommendations,
  ...unrelatedRecommendations,
]
const recommendationOwners = [
  ...targetRecommendations.map(() => targetReceipt),
  ...crossMonthRecommendations.map(() => crossMonthReceipt),
  ...otherReceipts.flatMap(id => Array<string>(recommendationCountPerOtherReceipt).fill(id)),
]

/** The immutable review and its receipt remain reusable in the disposable harness. */
export async function seedCopyrightUnlinkedRecommendations(): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* seedCopyrightUnlinkedRecommendationReceipts */
     INSERT INTO copyright_notice_email_intake_receipts
       (id, amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size)
     SELECT id, 'explain-unlinked-recommendation-' || id, sha256(uuid_send(id)), sha256(uuid_send(id)), 1
     FROM unnest($1::uuid[]) AS input(id) ON CONFLICT (id) DO NOTHING`,
    [receiptIds],
  )
  await query(
    `/* seedCopyrightUnlinkedRecommendationIdentities */
     INSERT INTO copyright_notice_email_intake_recommendation_identities
       (id, copyright_notice_email_intake_receipt_id, input_sha256, prompt_version)
     SELECT id, owner_id, sha256(uuid_send(id)), 'explain-v1'
     FROM unnest($1::uuid[], $2::uuid[]) AS input(id, owner_id) ON CONFLICT (id) DO NOTHING`,
    [recommendationIds, recommendationOwners],
  )
  await query(
    `/* seedCopyrightUnlinkedRecommendations */
     INSERT INTO ${recommendationRelation}
       (id, copyright_notice_email_intake_receipt_id, input_sha256, prompt_version, model, structured_output_ciphertext)
     SELECT id, owner_id, sha256(uuid_send(id)), 'explain-v1', 'explain-model', 'synthetic-ciphertext'
     FROM unnest($1::uuid[], $2::uuid[]) AS input(id, owner_id)
     ON CONFLICT (copyright_notice_email_intake_receipt_id, id) DO NOTHING`,
    [recommendationIds, recommendationOwners],
  )
  await query(
    `/* seedCopyrightUnlinkedRecommendationReviews */
     INSERT INTO ${reviewRelation}
       (id, copyright_notice_email_intake_receipt_id, copyright_notice_email_intake_recommendation_id,
        reviewed_at, reviewed_by_id, decision, rationale_ciphertext)
     SELECT id, owner_id, recommendation_id, uuid_extract_timestamp(id), $4,
       'rejected', 'synthetic-ciphertext'
     FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS input(id, owner_id, recommendation_id)
     WHERE NOT EXISTS (SELECT 1 FROM ${reviewRelation} review
       WHERE review.copyright_notice_email_intake_receipt_id = input.owner_id AND review.id = input.id)`,
    [reviewIds, receiptIds, reviewedRecommendations, seedUuid(0, '01')],
  )
  await query(
    `/* seedCopyrightUnlinkedRecommendationReviewOwner */
     UPDATE copyright_notice_email_intake_receipts
     SET review_decision = 'rejected', reviewed_at = uuid_extract_timestamp(input.review_id),
       reviewed_by_id = $3, review_rationale_ciphertext = 'synthetic-ciphertext'
     FROM unnest($1::uuid[], $2::uuid[]) AS input(receipt_id, review_id)
     WHERE id = input.receipt_id AND review_decision IS NULL`,
    [[targetReceipt, crossMonthReceipt], [targetReview, crossMonthReview], seedUuid(0, '01')],
  )
  await query.commit()
}

export async function cleanupCopyrightUnlinkedRecommendations(): Promise<void> {
  const reviewedIds = new Set(reviewedRecommendations)
  await using query = await beginTransaction()
  await query(enableRecommendationRetention)
  await query(
    `/* cleanupCopyrightUnlinkedRecommendations */
     DELETE FROM ${recommendationRelation} WHERE id = ANY($1::uuid[])`,
    [recommendationIds.filter(id => !reviewedIds.has(id))],
  )
  await query.commit()
}
