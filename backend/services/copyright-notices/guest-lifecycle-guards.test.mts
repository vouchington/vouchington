import { read, write } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import sql from 'sql-template-strings'
import { describe, expect, it } from 'vitest'
import { copyrightCorrespondencePurpose } from './correspondence.mts'
import {
  appendCopyrightGuestFiling,
  authorizeCopyrightGuestCapability,
  createCopyrightNoticeAggregate,
  getCopyrightNoticePrivateAggregate,
  getCopyrightParticipantNoticeDetail,
  getCopyrightPublicNoticeDetail,
  issueCopyrightGuestCapability,
  requestCopyrightGuestInformation,
} from './index.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'

async function openNotice() {
  const owner = await createTestUserDirect()
  const imageId = await insertTestImage(owner.id)
  const postId = await insertTestPost({
    title: `guest copyright ${crypto.randomUUID()}`,
    slug: `guest-copyright-${crypto.randomUUID()}`,
    createdById: owner.id,
    markdown: 'image',
  })
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('fixture image placement disappeared')
  const receivedAt = new Date('2026-07-01T12:00:00.000Z')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt,
    claimantUserId: null,
    claimantDisplayName: null,
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'staff',
      bodyCiphertext: `notice-${crypto.randomUUID()}`,
    },
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  return { notice, owner, receivedAt }
}

describe('copyright guest lifecycle guards', () => {
  it('keeps receipt time, deadlines, and restrictions unchanged', async () => {
    const { notice, owner, receivedAt } = await openNotice()
    const actor = await createTestUserDirect()
    const capability = await issueCopyrightGuestCapability({
      noticeId: notice.id,
      expiresAt: new Date('2026-07-03T12:00:00.000Z'),
    })
    const before = await getCopyrightNoticePrivateAggregate(notice.id)
    const targetId = before?.targets[0]?.id
    const submissionId = before?.submissions[0]?.id
    if (!targetId || !submissionId) throw new Error('fixture notice disappeared')
    await write(sql`/* guestLifecycle:counterClock */
      WITH counter_notice AS (
        INSERT INTO copyright_notice_submissions (
          copyright_notice_id, kind, received_at, source_kind, body_ciphertext
        ) VALUES (
          ${notice.id}, 'counter_notice', ${receivedAt}, 'signed_in_form', ${`counter-${crypto.randomUUID()}`}
        ) RETURNING id
      ), assessment AS (
        INSERT INTO copyright_notice_submission_assessments (
          copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant
        ) SELECT id, ${receivedAt}, ${actor.id}, true FROM counter_notice
        RETURNING id
      )
      INSERT INTO copyright_notice_deadlines (
        copyright_notice_id, qualifying_counter_notice_assessment_id, earliest_restoration_at,
        escalation_at, restoration_deadline_at
      ) SELECT ${notice.id}, id, ${new Date('2026-07-20T00:00:00.000Z')},
        ${new Date('2026-07-21T00:00:00.000Z')}, ${new Date('2026-07-22T00:00:00.000Z')}
      FROM assessment
    `)
    await write(sql`/* guestLifecycle:restriction */
      WITH assessment AS (
        INSERT INTO copyright_notice_submission_assessments (
          copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant
        ) VALUES (${submissionId}, ${receivedAt}, ${actor.id}, true)
        RETURNING id
      )
      INSERT INTO copyright_restrictions (
        copyright_notice_target_id, authorizing_assessment_id, imposed_at, imposed_by_id
      ) SELECT ${targetId}, id, ${receivedAt}, ${actor.id} FROM assessment
    `)
    const statement = `correction-${crypto.randomUUID()}`
    const filing = await appendCopyrightGuestFiling({
      noticeId: notice.id,
      token: capability.token,
      now: new Date('2026-07-02T15:00:00.000Z'),
      kind: 'supplement',
      statement,
    })
    await appendCopyrightGuestFiling({
      noticeId: notice.id,
      token: capability.token,
      now: new Date('2026-07-02T16:00:00.000Z'),
      kind: 'withdrawal',
      statement: `withdrawal-${crypto.randomUUID()}`,
    })
    const court = await appendCopyrightGuestFiling({
      noticeId: notice.id,
      token: capability.token,
      now: new Date('2026-07-02T17:00:00.000Z'),
      kind: 'court_or_ccb_hold',
      statement: `court-${crypto.randomUUID()}`,
    })
    const after = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(after?.notice.received_at).toEqual(receivedAt)
    expect(after?.deadlines).toEqual([
      expect.objectContaining({
        earliest_restoration_at: new Date('2026-07-20T00:00:00.000Z'),
        restoration_deadline_at: new Date('2026-07-22T00:00:00.000Z'),
        cancelled_at: null,
      }),
    ])
    expect(after?.restrictions).toEqual([
      expect.objectContaining({ lifted_at: null, copyright_notice_target_id: targetId }),
    ])
    expect(after?.holdAssessments).toEqual([])
    const stored = await read<{ body_ciphertext: string }>(
      sql`SELECT body_ciphertext FROM copyright_notice_submissions WHERE id = ${filing.id}`,
    )
    expect(stored.rows[0]?.body_ciphertext).not.toBe(statement)
    expect(
      decryptSecret(stored.rows[0]?.body_ciphertext ?? '', copyrightSubmissionPurpose(filing.id)),
    ).toBe(statement)
    const urgent = await read<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM copyright_notice_urgent_filings WHERE copyright_notice_submission_id = ${court.id}`,
    )
    expect(urgent.rows[0]?.count).toBe('1')
    await write(
      sql`UPDATE copyright_notices SET accepted_at = ${receivedAt} WHERE id = ${notice.id}`,
    )
    const viewer = { ...owner, roles: [] as const }
    const participant = await getCopyrightParticipantNoticeDetail(notice.id, viewer)
    const publicDetail = await getCopyrightPublicNoticeDetail(notice.id)
    const projected = JSON.stringify({ participant, publicDetail })
    expect(projected).not.toContain('ciphertext')
    expect(projected).not.toContain(capability.token)
    expect(projected).not.toContain(statement)
    expect(Object.keys(publicDetail ?? {}).sort()).toEqual([
      'accepted_at',
      'claimant',
      'id',
      'jurisdiction',
      'provisional_withholding_at',
      'received_at',
      'target_count',
      'targets',
      'timeline',
    ])
  })

  it('does not treat mail or a staff information request as a capability', async () => {
    const { notice } = await openNotice()
    const staffRecord = await createTestUserDirect()
    const staff = { ...staffRecord, roles: ['moderator'] as const }
    const capability = await issueCopyrightGuestCapability({
      noticeId: notice.id,
      expiresAt: new Date('2026-07-03T12:00:00.000Z'),
    })
    const request = await requestCopyrightGuestInformation({
      currentUser: staff,
      noticeId: notice.id,
      capabilityId: capability.id,
      statement: `Please send the registration ${crypto.randomUUID()}`,
    })
    const stored = await read<{ body_ciphertext: string }>(
      sql`SELECT body_ciphertext FROM copyright_notice_correspondence_messages WHERE id = ${request.id}`,
    )
    expect(
      decryptSecret(
        stored.rows[0]?.body_ciphertext ?? '',
        copyrightCorrespondencePurpose(request.id),
      ),
    ).toContain('Please send the registration')
    await expect(
      authorizeCopyrightGuestCapability({
        noticeId: notice.id,
        token: 'spoofed@example.test',
        now: new Date('2026-07-02T12:00:00.000Z'),
      }),
    ).resolves.toBeNull()
    const capabilities = await read<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM copyright_notice_guest_capabilities WHERE copyright_notice_id = ${notice.id}`,
    )
    expect(capabilities.rows[0]?.count).toBe('1')
  })
})
