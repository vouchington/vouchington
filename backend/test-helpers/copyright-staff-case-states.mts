// Test-only staff case states for browser specs: each helper adds one real piece of case state.
import { randomBytes } from 'node:crypto'
import { write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type { PrivateUser } from '../services/users/types.mts'
import { insertTestImage } from './entities/images-insert.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import {
  failTestCopyrightActionIntent,
  failTestCopyrightDeliveryIntent,
} from './data-stores/psql/copyright-notice-reads.mts'
import {
  createCopyrightAppeal,
  createCopyrightCounterNotice,
  copyrightSubmissionPurpose,
} from '../services/copyright-notices/submissions.mts'
import { issueCopyrightGuestCapability } from '../services/copyright-notices/guest-capabilities.mts'

type CaseFixture = {
  poster: PrivateUser
  moderator: PrivateUser
  noticeId: string
  targetId: string
}

function required<Value>(value: Value | null | undefined, message: string): Value {
  if (value === null || value === undefined) throw new Error(message)
  return value
}

async function readAggregate(noticeId: string) {
  return required(await getCopyrightNoticePrivateAggregate(noticeId), 'Copyright aggregate missing')
}

/** The poster appeals the restriction the fixture imposed. */
export async function addCopyrightAppeal(fixture: CaseFixture) {
  await createCopyrightAppeal(fixture.poster, fixture.noticeId, crypto.randomUUID(), {
    reason: 'This is my owned photograph.',
    targetIds: [fixture.targetId],
  })
}

/** The poster files a statutory counter-notice against the fixture's restriction. */
export async function addCopyrightCounterNotice(fixture: CaseFixture) {
  await createCopyrightCounterNotice(fixture.poster, fixture.noticeId, crypto.randomUUID(), {
    name: 'Hosted-material poster',
    address: '1 Main Street, Example City',
    telephone: '555-0100',
    consentToFederalJurisdiction: true,
    consentToServiceOfProcess: true,
    goodFaithMisidentificationUnderPenaltyOfPerjury: true,
    electronicSignature: 'Hosted-material poster',
    targetIds: [fixture.targetId],
  })
}

/** A staff-entered court filing that no moderator has assessed yet. */
export async function addCopyrightLegalHold(noticeId: string) {
  const { rows } = await write<{ id: string }>(sql`/* addCopyrightLegalHold:id */
    SELECT uuidv7() AS id
  `)
  const { id } = required(rows[0], 'Copyright submission id missing')
  const statement = encryptSecret(
    JSON.stringify({ description: 'Complaint filed in federal court.' }),
    copyrightSubmissionPurpose(id),
  )
  await write(sql`/* addCopyrightLegalHold */
    INSERT INTO copyright_notice_submissions (
      id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext
    ) VALUES (${id}, ${noticeId}, 'court_or_ccb_hold', CURRENT_TIMESTAMP, 'staff', ${statement})
  `)
}

/** Marks the case's queued media action and notice delivery failed so staff can retry them. */
export async function failCopyrightRecoveryIntents(noticeId: string) {
  const aggregate = await readAggregate(noticeId)
  await failTestCopyrightActionIntent(
    required(aggregate.actionIntents[0], 'Copyright action intent missing').id,
  )
  await failTestCopyrightDeliveryIntent(
    required(aggregate.deliveryIntents[0], 'Copyright delivery intent missing').id,
  )
}

/** An upload that looks like the restricted image, waiting for staff to mark it reviewed. */
export async function addCopyrightStaydownMatch(fixture: CaseFixture) {
  const aggregate = await readAggregate(fixture.noticeId)
  const restriction = required(aggregate.restrictions[0], 'Copyright restriction missing')
  const target = required(aggregate.targets[0], 'Copyright target missing')
  const uploadId = await insertTestImage(fixture.poster.id)
  const { rows } = await write<{ id: string }>(sql`/* addCopyrightStaydownMatch:entry */
    INSERT INTO copyright_staydown_entries (copyright_restriction_id, image_id, sha_256)
    VALUES (${restriction.id}, ${target.image_id}, ${randomBytes(32)}) RETURNING id
  `)
  await write(sql`/* addCopyrightStaydownMatch:match */
    INSERT INTO copyright_staydown_matches (
      copyright_staydown_entry_id, image_id, uploaded_by_id, match_kind, hamming_distance
    ) VALUES (${required(rows[0], 'Staydown entry missing').id}, ${uploadId}, ${fixture.poster.id}, 'exact', 0)
  `)
}

/** Issues enough guest access to a case that the staff list pages. */
export async function issueManyCopyrightGuestCapabilities(fixture: CaseFixture, count: number) {
  const issuedAt = new Date()
  const expiresAt = new Date(issuedAt.getTime() + 24 * 60 * 60 * 1000)
  await Promise.all(
    Array.from({ length: count }, () =>
      issueCopyrightGuestCapability({
        currentUser: fixture.moderator,
        noticeId: fixture.noticeId,
        issuedAt,
        expiresAt,
      }),
    ),
  )
}
