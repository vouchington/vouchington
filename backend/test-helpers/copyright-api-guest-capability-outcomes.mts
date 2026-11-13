import { expect } from 'vitest'
import { hashToken } from '@modules/token-secrets'
import { copyrightGuestCapabilityPurpose } from '../services/copyright-notices/guest-capabilities.mts'
import type { createRequest } from './api/server.mts'
import { readApiGuestState } from './copyright-api-guest-state.mts'

const conflict = {
  status: 409,
  code: 'CONFLICT',
  message: 'Conflicting copyright case change',
  value: undefined,
}
/** One issue request commits its identity/hash/issuer/expiry/audit together or creates none. */
export async function assertApiGuestCapabilityIssue(
  staff: ReturnType<typeof createRequest>,
  noticeId: string,
  actorId: string,
  expiresAt: string,
) {
  const before = await readApiGuestState(noticeId)
  const response = await staff
    .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
    .send({ expires_at: expiresAt })
  const after = await readApiGuestState(noticeId)
  const result = response.body.copyright_guest_capability as
    | { id: string; token: string; expires_at: string }
    | undefined
  const id = result?.id
  const tokenHash = result ? hashToken(copyrightGuestCapabilityPurpose, result.token) : undefined
  expect([
    { ...conflict, state: before },
    {
      status: 201,
      code: undefined,
      message: undefined,
      value: {
        id: expect.any(String),
        token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        expires_at: expiresAt,
      },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        activity: { guest: expect.any(Date), lifecycle: expect.any(Date) },
        identities: [
          ...before.identities,
          { id, copyright_notice_id: noticeId, created_at: expect.any(Date) },
        ],
        capabilities: [
          ...before.capabilities,
          expect.objectContaining({
            id,
            copyright_notice_id: noticeId,
            token_hash: tokenHash,
            issued_by_id: actorId,
            expires_at: new Date(expiresAt),
            revoked_at: null,
            created_at: expect.any(Date),
            updated_at: expect.any(Date),
          }),
        ],
        aggregate: {
          ...before.aggregate,
          lifecycleEvents: [
            ...before.aggregate.lifecycleEvents,
            expect.objectContaining({
              copyright_notice_id: noticeId,
              change_type: 'guest_capability_issued',
              changed_by_id: actorId,
              copyright_notice_guest_capability_id: id,
            }),
          ],
        },
      },
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    value: result,
    state: after,
  })
  expect(after.clock.at.getTime()).toBeGreaterThanOrEqual(before.clock.at.getTime())
}

/** Revocation changes exactly this capability and its audit; it does not erase the retained identity. */
export async function assertApiGuestCapabilityRevoke(
  staff: ReturnType<typeof createRequest>,
  noticeId: string,
  capabilityId: string,
  actorId: string,
) {
  const before = await readApiGuestState(noticeId)
  const response = await staff.post(
    `/api/v1/copyright-notices/${noticeId}/guest-capabilities/${capabilityId}/revocation`,
  )
  const after = await readApiGuestState(noticeId)
  const result = response.body.copyright_guest_capability as
    | { id: string; revoked_at: string }
    | undefined
  const revoked = result ? new Date(result.revoked_at) : null
  expect([
    { ...conflict, state: before },
    {
      status: 200,
      code: undefined,
      message: undefined,
      value: { id: capabilityId, revoked_at: expect.any(String) },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        activity: { guest: expect.any(Date), lifecycle: expect.any(Date) },
        capabilities: before.capabilities.map(row =>
          row.id === capabilityId
            ? { ...row, revoked_at: revoked, updated_at: expect.any(Date) }
            : row,
        ),
        aggregate: {
          ...before.aggregate,
          lifecycleEvents: [
            ...before.aggregate.lifecycleEvents,
            expect.objectContaining({
              copyright_notice_id: noticeId,
              change_type: 'guest_capability_revoked',
              changed_by_id: actorId,
              copyright_notice_guest_capability_id: capabilityId,
            }),
          ],
        },
      },
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    value: result,
    state: after,
  })
  expect(after.clock.at.getTime()).toBeGreaterThanOrEqual(before.clock.at.getTime())
}
