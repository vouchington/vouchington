import {
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from './entities/index.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { openCopyrightSecrets } from '../services/copyright-notices/encryption-keys.mts'
import type { ScopedCopyrightSecrets } from '../services/copyright-notices/encryption-key-capabilities.mts'
import type { FiledNoticeRow } from '../services/copyright-notices/stream-copyright-rows.mts'
import { createTestUserDirect } from './entities/users-direct.mts'

export type CopyrightExportFiledRowFixture = AsyncDisposable & {
  row: FiledNoticeRow
  secrets: ScopedCopyrightSecrets
}

/** Makes export ciphertext with the key attached to a real, independently owned notice. */
export async function createCopyrightExportFiledRowFixture(): Promise<CopyrightExportFiledRowFixture> {
  const claimant = await createTestUserDirect()
  const imageId = await insertTestImage(claimant.id)
  const postId = await insertTestPost({
    title: `Copyright export ${crypto.randomUUID()}`,
    slug: `copyright-export-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: 'Copyright export fixture target.',
  })
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('Copyright export fixture placement disappeared')

  const idempotencyKey = crypto.randomUUID()
  const purpose = `copyright-form:${idempotencyKey}`
  const receivedAt = new Date()
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt,
    claimantUserId: claimant.id,
    claimantDisplayName: 'Export fixture claimant',
    claimantContact: '1 Export Way',
    secretPurpose: purpose,
    workDescription: 'Export fixture photograph',
    policyVersion: 'account-data-export-test',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'signed_in_form',
      body: JSON.stringify({ claimant_targets: [{ postId }] }),
    },
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        bindingFamily: 'post',
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })

  const secrets = await openCopyrightSecrets({ kind: 'notice', id: notice.id })
  try {
    const row: FiledNoticeRow = {
      notice_id: notice.id,
      received_at: receivedAt,
      jurisdiction: notice.jurisdiction,
      erased_by_retention_at: null,
      claimant_display_name: notice.claimant_display_name ?? '',
      claimant_contact_ciphertext: notice.claimant_contact_ciphertext,
      work_description: notice.work_description,
      idempotency_key: idempotencyKey,
      has_good_faith_belief: true,
      has_accuracy_authority_under_penalty_of_perjury: true,
      electronic_signature_ciphertext: secrets.encryptSecret(
        '/s/ Export fixture claimant',
        purpose,
      ),
      body_ciphertext: secrets.encryptSecret(
        JSON.stringify({ claimant_targets: [{ postId }] }),
        purpose,
      ),
    }
    return {
      row,
      secrets,
      async [Symbol.asyncDispose]() {
        await secrets[Symbol.asyncDispose]()
      },
    }
  } catch (err) {
    await secrets[Symbol.asyncDispose]()
    throw err
  }
}
