import { randomBytes } from 'node:crypto'
import { beginTransaction, read } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import {
  prepareCopyrightEncryptionKey,
  attachCopyrightEncryptionKey,
  openCopyrightSecrets,
} from '../services/copyright-notices/encryption-keys.mts'
import sql from 'sql-template-strings'
import { createTestUser } from './entities/users.mts'
import { createHostedImagePost } from './services/copyright-notices/hosted-post-audience.mts'
import { withdrawCopyrightJurisdictionPolicyApproval } from '../services/copyright-notices/jurisdiction-policy.mts'
import { territorialLabels } from '../services/copyright-notices/territorial-labels.mts'

/** Commits an owned receipt and its withdrawn approval atomically, without enabling intake. */
export async function createTestDsaApprovalWithdrawalScene(
  jurisdiction: 'eu_dsa' | 'uk' = 'eu_dsa',
) {
  const post = await createHostedImagePost('public')
  const [staff, administrator] = await Promise.all([
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser({ administrator: true }),
  ])
  const key = crypto.randomUUID()
  const policyVersion = `${jurisdiction === 'eu_dsa' ? 'eu' : 'uk'}-${key.slice(0, 12)}`
  const email = `withdrawal-${key}@example.test`
  const purpose = `${territorialLabels(jurisdiction).noticePurpose}:${key}`
  const hostedUseUrl = `https://voucha.ai/discussion/${post.postId}`
  const noticeId = uuidv7()
  const owner = { kind: 'notice' as const, id: noticeId }
  await using prepared = await prepareCopyrightEncryptionKey('notice')
  await using transaction = await beginTransaction()
  await attachCopyrightEncryptionKey(prepared, owner, transaction)
  const { rows: approvals } = await transaction<{ id: string }>(sql`
    /* createTestDsaApprovalWithdrawalScene:approval */
    INSERT INTO copyright_jurisdiction_policy_approvals
      (jurisdiction, policy_version, approved_at, approved_by_id)
    VALUES (${jurisdiction}, ${policyVersion}, ${new Date('2000-01-01T00:00:00.000Z')}, ${administrator.id})
    RETURNING id
  `)
  const approvalId = approvals[0]?.id
  if (!approvalId) throw new Error('Owned EU approval was not inserted')
  const { rows: notices } = await transaction<{ id: string }>(sql`
    /* createTestDsaApprovalWithdrawalScene:notice */
    INSERT INTO copyright_notices (
      id, jurisdiction, legal_basis, received_at, claimant_user_id, claimant_display_name,
      claimant_contact_ciphertext, work_description, policy_version
    ) VALUES (
      ${noticeId}, ${jurisdiction}, 'copyright', CURRENT_TIMESTAMP, ${post.claimant.id}, 'Owned notifier',
      ${prepared.encrypt(email, `${purpose}:contact`, owner)}, 'Photographic work', ${policyVersion}
    ) RETURNING id
  `)
  if (!notices[0]?.id) throw new Error('Owned EU notice was not inserted')
  await using secrets = await openCopyrightSecrets(owner, transaction, 'write')
  const { encryptSecret } = secrets
  await transaction(sql`
    /* createTestDsaApprovalWithdrawalScene:receipt */
    INSERT INTO copyright_territorial_notice_receipts (
      copyright_notice_id, jurisdiction, copyright_jurisdiction_policy_approval_id,
      requester_user_id, requester_identity_hmac, idempotency_key, request_sha256,
      hosted_use_url, grounds_ciphertext, notifier_email_ciphertext, has_good_faith_statement
    ) VALUES (
      ${noticeId}, ${jurisdiction}, ${approvalId}, ${post.claimant.id}, ${randomBytes(32)}, ${key}, ${randomBytes(32)},
      ${hostedUseUrl}, ${encryptSecret('The hosted image reproduces my work', `${purpose}:grounds`)},
      ${jurisdiction === 'eu_dsa' ? encryptSecret(email, `${purpose}:notifier_email`) : null},
      ${jurisdiction === 'eu_dsa' ? true : null}
    )
  `)
  const withdrawal = await withdrawCopyrightJurisdictionPolicyApproval(administrator, approvalId, {
    query: transaction,
  })
  await transaction.commit()
  return {
    staff,
    administrator,
    approvalId,
    withdrawalId: withdrawal.id,
    noticeId,
    targets: [
      {
        surfaceKind: 'post-image' as const,
        postId: post.postId,
        imageId: post.imageId,
        hostedUseUrl,
      },
    ],
  }
}

export async function readTestDsaReceiptApproval(noticeId: string) {
  const { rows } = await read<{ approval_id: string; withdrawal_id: string | null }>(sql`
    /* readTestDsaReceiptApproval */
    SELECT receipt.copyright_jurisdiction_policy_approval_id AS approval_id,
      withdrawal.id AS withdrawal_id
    FROM copyright_territorial_notice_receipts receipt
    LEFT JOIN copyright_jurisdiction_policy_withdrawals withdrawal
      ON withdrawal.copyright_jurisdiction_policy_approval_id = receipt.copyright_jurisdiction_policy_approval_id
    WHERE receipt.copyright_notice_id = ${noticeId}
  `)
  if (!rows[0]) throw new Error('Owned EU receipt was not found')
  return rows[0]
}
