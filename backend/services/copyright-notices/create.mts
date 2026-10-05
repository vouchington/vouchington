import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightNoticeRecord, CreateCopyrightNoticeAggregateInput } from './types.mts'
import { insertCopyrightNoticeTargetsInTransaction } from './notice-targets.mts'

/** Internal transaction-aware variant for admission records which must commit with a legal case. */
export async function createCopyrightNoticeAggregateInTransaction(
  input: CreateCopyrightNoticeAggregateInput,
  transaction: TransactionQuery,
): Promise<CopyrightNoticeRecord> {
  assert(input.jurisdiction === 'us_dmca', 422, 'Only US DMCA notices use this aggregate')
  assert(input.targets.length > 0, 422, 'A copyright notice requires at least one hosted target')
  const { rows } = await transaction<CopyrightNoticeRecord>(sql`/* createCopyrightNoticeAggregate */
    INSERT INTO copyright_notices (
      jurisdiction, legal_basis, received_at, claimant_user_id, claimant_display_name,
      claimant_contact_ciphertext, work_description, policy_version
    ) VALUES (
      ${input.jurisdiction}, 'copyright', ${input.receivedAt}, ${input.claimantUserId},
      ${input.claimantDisplayName}, ${input.claimantContactCiphertext}, ${input.workDescription},
      ${input.policyVersion}
    )
    RETURNING id, jurisdiction, legal_basis, received_at, accepted_at, provisional_withholding_at,
      claimant_user_id, claimant_display_name, claimant_contact_ciphertext, work_description,
      policy_version
  `)
  const notice = rows[0]
  assert(notice, 500, 'Failed to create copyright notice')
  await insertCopyrightNoticeTargetsInTransaction(notice.id, input.targets, transaction)
  await Promise.all([
    transaction(sql`/* createCopyrightNoticeAggregate:submission */
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id, submitted_by_id, kind, received_at, source_kind, body_ciphertext
      ) VALUES (
        ${notice.id}, ${input.claimantUserId}, 'notice', ${input.receivedAt},
        ${input.initialSubmission.sourceKind}, ${input.initialSubmission.bodyCiphertext}
      )
    `),
    transaction(sql`/* createCopyrightNoticeAggregate:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type)
    VALUES (${notice.id}, 'notice_received')
  `),
  ])
  return notice
}
