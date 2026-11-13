import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { hashToken } from '@modules/token-secrets'
import { createTestUser } from './index.mts'
import { createCopyrightNoticeForManualAssociation } from './copyright-email-manual-association.mts'
import { createCommittedCopyrightEmailIntake } from './copyright-email-committed-intake.mts'
import { readOwnedCopyrightManualState } from './copyright-manual-association-outcome.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import { commitCopyrightWritersInOrder } from './copyright-form-review-assessment-race.mts'
import {
  issueCopyrightGuestCapability,
  copyrightGuestCapabilityPurpose,
} from '../services/copyright-notices/guest-capabilities.mts'
import { associateCopyrightEmailIntakeWithNotice } from '../services/copyright-notices/email-manual-association.mts'

async function state(noticeId: string, intakeId: string) {
  const [manual, { rows: identities }, { rows: capabilities }, { rows: clocks }] =
    await Promise.all([
      readOwnedCopyrightManualState(intakeId, noticeId),
      write<{ id: string }>(
        sql`/* guestAssociationState:identities */ SELECT id FROM copyright_notice_guest_capability_identities WHERE copyright_notice_id = ${noticeId} ORDER BY id`,
      ),
      write<{
        id: string
        token_hash: string
        copyright_notice_id: string
        issued_by_id: string | null
        expires_at: Date
        revoked_at: Date | null
        created_at: Date
        updated_at: Date
      }>(
        sql`/* guestAssociationState:capabilities */ SELECT * FROM copyright_notice_guest_capabilities WHERE copyright_notice_id = ${noticeId} ORDER BY id`,
      ),
      write<{ at: Date | null }>(
        sql`/* guestAssociationState:clock */ SELECT last_guest_capability_activity_at AS at FROM copyright_notices WHERE id = ${noticeId}`,
      ),
    ])
  return { manual, identities, capabilities, guestClock: clocks[0]?.at }
}

/** Same-case issuance and association keep their complete facts, or native SSI rolls them back. */
export async function assertGuestCapabilityAndAssociation(first: 'capability' | 'association') {
  const staff = await createTestUser({ extraRoles: ['moderator'] })
  const noticeId = await createCopyrightNoticeForManualAssociation()
  // An unresolved follow-up is eligible for manual association; an initial email needs approval.
  const intake = await createCommittedCopyrightEmailIntake({
    inReplyTo: [`<${crypto.randomUUID()}@example.test>`],
  })
  const before = await state(noticeId, intake.id)
  const issuedAt = new Date()
  const expiresAt = new Date(issuedAt.getTime() + 86_400_000)
  const issue = () =>
    issueCopyrightGuestCapability({ currentUser: staff, noticeId, issuedAt, expiresAt })
  const associate = () => associateCopyrightEmailIntakeWithNotice(staff, intake.id, noticeId)
  const [one, two] = await commitCopyrightWritersInOrder(
    first === 'capability' ? issue : associate,
    first === 'capability' ? associate : issue,
    first === 'capability'
      ? 'issueCopyrightGuestCapability'
      : 'associateCopyrightEmailIntakeWithNotice:link',
    first === 'capability'
      ? 'associateCopyrightEmailIntakeWithNotice:link'
      : 'issueCopyrightGuestCapability',
    noticeId,
    [noticeId, intake.id],
  )
  const issued = first === 'capability' ? one : two
  const associated = first === 'capability' ? two : one
  const after = await state(noticeId, intake.id)
  const capability = after.capabilities[0]
  const issueConflict = {
    status: 'rejected',
    statusCode: 409,
    code: 'CONFLICT',
    message: 'Conflicting copyright case change',
    causeCode: '40001',
  }
  const associationConflict = {
    status: 'rejected',
    statusCode: 409,
    code: 'copyright_email_thread_changed',
    message: 'Copyright email thread changed; retry staff approval',
    causeCode: '40001',
  }
  const issueSuccess = {
    status: 'fulfilled',
    value: { id: capability?.id, token: expect.any(String) },
  }
  const associationSuccess = {
    status: 'fulfilled',
    value: { copyright_notice: { id: noticeId }, copyright_email_intake: { id: intake.id } },
  }
  const issuedState = {
    ...before,
    identities: [{ id: capability?.id }],
    capabilities: [
      {
        id: capability?.id,
        copyright_notice_id: noticeId,
        token_hash: expect.any(String),
        issued_by_id: staff.id,
        expires_at: expiresAt,
        revoked_at: null,
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
      },
    ],
    guestClock: expect.any(Date),
    manual: {
      ...before.manual,
      clock: expect.any(Date),
      legal: {
        ...before.manual.legal,
        events: [...before.manual.legal.events, 'guest_capability_issued'].toSorted(),
      },
    },
  }
  const associatedState = {
    ...before,
    manual: {
      ...before.manual,
      clock: expect.any(Date),
      links: [{ copyright_notice_id: noticeId, link_kind: 'thread' }],
      reviews: [{ copyright_notice_id: noticeId, action: 'pending' }],
      audit: [
        {
          copyright_notice_id: noticeId,
          changed_by_id: staff.id,
          copyright_notice_email_intake_id: intake.id,
        },
      ],
      legal: {
        ...before.manual.legal,
        events: [...before.manual.legal.events, 'email_intake_manually_associated'].toSorted(),
      },
    },
  }
  expect([
    { issue: issueSuccess, association: associationConflict, state: issuedState },
    { issue: issueConflict, association: associationSuccess, state: associatedState },
    { issue: issueConflict, association: associationConflict, state: before },
  ]).toContainEqual({
    issue: issued.status === 'fulfilled' ? issued : copyrightRaceResult(issued),
    association: associated.status === 'fulfilled' ? associated : copyrightRaceResult(associated),
    state: after,
  })
  const token =
    issued.status === 'fulfilled' &&
    typeof issued.value === 'object' &&
    issued.value !== null &&
    'token' in issued.value
      ? issued.value.token
      : null
  expect(capability?.token_hash ?? null).toEqual(
    typeof token === 'string' ? hashToken(copyrightGuestCapabilityPurpose, token) : null,
  )
}
