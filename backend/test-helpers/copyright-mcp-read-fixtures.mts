import { write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { createCopyrightFormIntake } from '../services/copyright-notices/form-intakes.mts'
import { appendCopyrightFormScreening } from '../services/copyright-notices/form-screenings.mts'
import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import { createHostedImagePost } from './services/copyright-notices/hosted-post-audience.mts'
import { testCopyrightFormGuidance } from './services/copyright-notices/form-guidance.mts'

async function appendStatement(
  noticeId: string,
  kind: 'counter_notice' | 'court_or_ccb_hold',
  statement: Record<string, unknown>,
) {
  const { rows } = await write<{ id: string }>(sql`SELECT uuidv7() AS id`)
  const id = rows[0]?.id
  if (!id) throw new Error('Could not allocate copyright submission id')
  await write(sql`
    INSERT INTO copyright_notice_submissions (
      id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext
    ) VALUES (
      ${id}, ${noticeId}, ${kind}, CURRENT_TIMESTAMP, 'staff',
      ${encryptSecret(JSON.stringify(statement), copyrightSubmissionPurpose(id))}
    )
  `)
}

/** Real pending form case with private contact text in both statutory statements. */
export async function createTestCopyrightMcpQueueCase() {
  const marker = crypto.randomUUID()
  const contactEmail = `mcp-${marker}@example.test`
  const phone = '415-555-0181'
  const address = `17 Secret Lane ${marker}`
  const { claimant, poster, postId, imageId } = await createHostedImagePost('public')
  const { intake } = await createCopyrightFormIntake({
    currentUser: claimant,
    requesterIdentity: `user:${claimant.id}`,
    idempotencyKey: crypto.randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: 'Claimant Name',
      claimantContact: contactEmail,
      claimantEmail: contactEmail,
      workDescription: `My photo; call ${phone} or write ${contactEmail}`,
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Claimant Signature',
      claimantTargets: [
        {
          surfaceKind: 'post-image',
          postId,
          imageId,
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
    },
  })
  const guidance = {
    ...testCopyrightFormGuidance,
    summary: 'Model summary for moderator review.',
    elements: testCopyrightFormGuidance.elements.map(item =>
      item.element === 'contact_information'
        ? { ...item, status: 'unclear' as const, gap: 'Model gap for moderator review.' }
        : item,
    ),
  }
  await appendCopyrightFormScreening({
    intakeId: intake.id,
    inputSha256: Buffer.alloc(32, 19),
    recommendation: 'not_obviously_invalid',
    rationale: 'Model rationale for moderator review.',
    guidance,
    promptVersion: 'copyright-mcp-read-test',
    model: 'test-model',
  })
  await appendStatement(intake.copyright_notice_id, 'counter_notice', {
    name: 'Poster Name',
    electronic_signature: 'Poster Signature',
    address,
    telephone: phone,
    explanation: `Reply to ${contactEmail}`,
  })
  await appendStatement(intake.copyright_notice_id, 'court_or_ccb_hold', {
    name: 'Counsel Name',
    address,
    telephone: phone,
    note: `Call ${phone}`,
  })
  return {
    intakeId: intake.id,
    noticeId: intake.copyright_notice_id,
    contactEmail,
    phone,
    address,
    marker,
    claimant,
    poster,
  }
}
