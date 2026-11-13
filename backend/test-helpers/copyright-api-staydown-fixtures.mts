import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { createTestUser } from './index.mts'
import { createClearScreenedForm } from './services/copyright-notices/screened-form.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { deliverInitialCopyrightWithhold } from './copyright-restoration-hold-fixtures.mts'
import { readCopyrightStaydownMatches } from './data-stores/psql/copyright-staydown.mts'

/** Owned match facts precede queue/review/preview subjects; no unrelated registry entry is written. */
export async function seedCopyrightApiStaydownMatch(input: {
  noticeId: string
  imageId: string
  uploaderId: string
  perceptualHash?: string
}) {
  await using transaction = await beginTransaction()
  const distance = input.perceptualHash
    ? sql`bit_count(entry.perceptual_hash # ${input.perceptualHash}::bit(64))`
    : sql`0`
  const statement = sql`/* seedCopyrightApiStaydownMatch */
    INSERT INTO copyright_staydown_matches
      (copyright_staydown_entry_id, image_id, uploaded_by_id, match_kind, hamming_distance)
    SELECT entry.id, image.id, ${input.uploaderId}, ${input.perceptualHash ? 'perceptual' : 'exact'}::copyright_staydown_match_kinds, `.append(
    distance,
  ).append(sql` FROM copyright_staydown_entries entry
    JOIN copyright_restrictions restriction ON restriction.id = entry.copyright_restriction_id
    JOIN images image ON image.id = ${input.imageId}
    WHERE restriction.copyright_notice_id = ${input.noticeId} AND image.deleted_at IS NULL`)
  statement.append(
    input.perceptualHash
      ? sql` AND entry.image_id <> image.id AND entry.perceptual_hash IS NOT NULL AND `
          .append(distance)
          .append(sql` <= 8`)
      : sql` AND entry.sha_256 = image.sha_256`,
  )
  statement.append(
    sql` ON CONFLICT (copyright_staydown_entry_id, image_id, uploaded_by_id) DO NOTHING RETURNING id`,
  )
  const { rows } = await transaction<{ id: string }>(statement)
  if (rows.length !== 1) throw new Error('Owned API staydown match was not uniquely inserted')
  await transaction.commit()
  return rows[0]!.id
}

/** Complete clear-screen/manual-acceptance/withhold state for independent queue and preview reads. */
export async function createCommittedApiStaydownCase() {
  const { notice } = await createClearScreenedForm()
  const moderator = await createTestUser({ extraRoles: ['moderator'] })
  const noticeId = notice.intake.copyright_notice_id
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId: notice.intake.copyright_notice_submission_id,
    assessedAt: new Date(),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  await using transaction = await beginTransaction()
  await transaction(sql`/* createCommittedApiStaydownCase:review */
    INSERT INTO copyright_notice_form_intake_reviews
      (copyright_notice_form_intake_id, reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext)
    VALUES (${notice.intake.id}, CURRENT_TIMESTAMP, ${moderator.id}, true,
      ${encryptSecret('The signed notice is complete.', `copyright-form-review:${notice.intake.id}`)})`)
  await transaction.commit()
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const target = aggregate?.targets[0]
  if (!target) throw new Error('Owned staydown target disappeared')
  await seedCopyrightStatementRestriction({
    noticeId,
    targetId: target.id,
    assessmentId: assessment.id,
    revision: target.placement_revision,
    moderatorId: moderator.id,
  })
  await deliverInitialCopyrightWithhold(noticeId)
  const uploader = await createTestUser()
  const matchId = await seedCopyrightApiStaydownMatch({
    noticeId,
    imageId: target.image_id,
    uploaderId: uploader.id,
  })
  const [match] = await readCopyrightStaydownMatches(noticeId)
  if (match?.id !== matchId) throw new Error('Owned staydown match disappeared')
  return { noticeId, moderator, imageId: target.image_id, uploader, targetId: target.id, matchId }
}
