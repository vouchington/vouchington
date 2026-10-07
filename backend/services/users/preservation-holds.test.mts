import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countUserDeletionRequestsForTest,
  createTestUser,
  getModeratorActionRowsForTest,
  hardDeleteTestUser,
  safeUsername,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { CONFLICT } from '@modules/on-error/error-codes'
import { deleteUser } from './delete.mts'
import { getPrivateUserByAny } from './get.mts'
import {
  listUserPreservationHolds,
  placeUserPreservationHold,
  releaseUserPreservationHold,
} from './preservation-holds.mts'

const BLOCKED_MESSAGE =
  'Account deletion is blocked while a copyright incident or legal hold is unresolved'
const MISSING_USER_ID = '00000000-0000-7000-0000-000000000001'

describe('user preservation holds', () => {
  beforeEach(() => {
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('account deletion while a preservation hold is open', () => {
    it('refuses self-service deletion with the existing 409 and changes nothing', async () => {
      const admin = await createTestUser({ administrator: true })
      const user = await createTestUser({ username: safeUsername('hold-self-delete') })
      await placeUserPreservationHold(admin, user.id, 'matter-1')

      await expect(deleteUser(user, user)).rejects.toMatchObject({
        status: 409,
        message: BLOCKED_MESSAGE,
      })

      expect(await getPrivateUserByAny(user.id)).not.toBeNull()
      expect(await countUserDeletionRequestsForTest(user.id)).toBe(0)
    })

    it('refuses administrator deletion of the held account too', async () => {
      const admin = await createTestUser({ administrator: true })
      const user = await createTestUser({ username: safeUsername('hold-admin-delete') })
      await placeUserPreservationHold(admin, user.id, 'matter-2')

      await expect(deleteUser(admin, user)).rejects.toMatchObject({ status: 409 })
      expect(await countUserDeletionRequestsForTest(user.id)).toBe(0)
    })

    it('allows deletion once the hold is released', async () => {
      const admin = await createTestUser({ administrator: true })
      const user = await createTestUser({ username: safeUsername('hold-released') })
      await placeUserPreservationHold(admin, user.id, 'matter-3')
      await expect(deleteUser(user, user)).rejects.toMatchObject({ status: 409 })

      await releaseUserPreservationHold(admin, user.id)

      await expect(deleteUser(user, user)).resolves.toEqual(
        expect.objectContaining({ requestId: expect.any(String) }),
      )
      expect(await countUserDeletionRequestsForTest(user.id)).toBe(1)
    })

    it('does not affect accounts without a hold', async () => {
      const admin = await createTestUser({ administrator: true })
      const held = await createTestUser({ username: safeUsername('hold-other-held') })
      const other = await createTestUser({ username: safeUsername('hold-other-free') })
      await placeUserPreservationHold(admin, held.id, 'matter-4')

      await expect(deleteUser(other, other)).resolves.toEqual(
        expect.objectContaining({ requestId: expect.any(String) }),
      )
    })

    it('places and releases a hold after the account is soft-deleted', async () => {
      const admin = await createTestUser({ administrator: true })
      const user = await createTestUser({ username: safeUsername('hold-deleted') })
      await softDeleteUserAt(user.id, new Date())

      const placed = await placeUserPreservationHold(admin, user.id, 'matter-5')
      const released = await releaseUserPreservationHold(admin, user.id)

      expect(released).toMatchObject({ id: placed.id, released_at: expect.any(Date) })
      await expect(listUserPreservationHolds(admin, user.id)).resolves.toEqual([released])
      const audit = await getModeratorActionRowsForTest({ targetUserId: user.id })
      expect(audit.map(row => row.action_type)).toEqual([
        'preservation_hold_release',
        'preservation_hold_place',
      ])
    })
  })

  describe('placeUserPreservationHold', () => {
    it('records who placed it, when, and the reference, and audits the action', async () => {
      const admin = await createTestUser({ administrator: true })
      const user = await createTestUser({ username: safeUsername('hold-place') })

      const hold = await placeUserPreservationHold(admin, user.id, '  Matter 2026-0042  ')

      expect(hold).toMatchObject({
        account_user_id: user.id,
        reference: 'Matter 2026-0042',
        placed_by_id: admin.id,
        released_at: null,
        released_by_id: null,
      })
      expect(hold.placed_at).toBeInstanceOf(Date)
      const audit = await getModeratorActionRowsForTest({ targetUserId: user.id })
      expect(audit).toEqual([
        expect.objectContaining({
          action_type: 'preservation_hold_place',
          actor_user_id: admin.id,
          target_user_id: user.id,
          community_id: null,
          reason: null,
        }),
      ])
      expect(JSON.stringify(audit)).not.toContain('Matter 2026-0042')
    })

    it('allows only one open hold per account', async () => {
      const admin = await createTestUser({ administrator: true })
      const user = await createTestUser({ username: safeUsername('hold-single') })
      await placeUserPreservationHold(admin, user.id, 'matter-a')

      await expect(placeUserPreservationHold(admin, user.id, 'matter-b')).rejects.toMatchObject({
        status: 409,
        code: CONFLICT,
      })
      await expect(listUserPreservationHolds(admin, user.id)).resolves.toHaveLength(1)
    })

    it.each([
      ['blank', '   '],
      ['too long', 'x'.repeat(501)],
      ['not a string', 42],
      ['missing', undefined],
    ])('rejects a %s reference with 422 without echoing it', async (_label, reference) => {
      const admin = await createTestUser({ administrator: true })
      const user = await createTestUser({ username: safeUsername('hold-invalid') })

      const attempt = placeUserPreservationHold(admin, user.id, reference)

      await expect(attempt).rejects.toMatchObject({ status: 422 })
      await expect(attempt).rejects.not.toThrow('xxxxx')
      await expect(listUserPreservationHolds(admin, user.id)).resolves.toEqual([])
    })

    it('returns 404 for an unknown user', async () => {
      const admin = await createTestUser({ administrator: true })

      await expect(
        placeUserPreservationHold(admin, MISSING_USER_ID, 'matter'),
      ).rejects.toMatchObject({ status: 404 })
    })

    it('returns 404 after the users row has been hard-deleted', async () => {
      const admin = await createTestUser({ administrator: true })
      const user = await createTestUser()
      await hardDeleteTestUser(user.id)

      await expect(placeUserPreservationHold(admin, user.id, 'matter')).rejects.toMatchObject({
        status: 404,
      })
    })
  })

  describe('releaseUserPreservationHold', () => {
    it('stamps who released it and when, keeps the row, and audits the action', async () => {
      const admin = await createTestUser({ administrator: true })
      const releaser = await createTestUser({ administrator: true })
      const user = await createTestUser({ username: safeUsername('hold-release') })
      const placed = await placeUserPreservationHold(admin, user.id, 'matter-release')

      const released = await releaseUserPreservationHold(releaser, user.id)

      expect(released).toMatchObject({
        id: placed.id,
        reference: 'matter-release',
        placed_by_id: admin.id,
        released_by_id: releaser.id,
      })
      expect(released.released_at).toBeInstanceOf(Date)
      await expect(listUserPreservationHolds(admin, user.id)).resolves.toEqual([released])
      const audit = await getModeratorActionRowsForTest({ targetUserId: user.id })
      expect(audit.map(row => [row.action_type, row.actor_user_id, row.reason])).toEqual([
        ['preservation_hold_release', releaser.id, null],
        ['preservation_hold_place', admin.id, null],
      ])
    })

    it('returns 409 when no hold is open and 404 for an unknown user', async () => {
      const admin = await createTestUser({ administrator: true })
      const user = await createTestUser({ username: safeUsername('hold-release-none') })

      await expect(releaseUserPreservationHold(admin, user.id)).rejects.toMatchObject({
        status: 409,
        code: CONFLICT,
      })
      await expect(releaseUserPreservationHold(admin, MISSING_USER_ID)).rejects.toMatchObject({
        status: 404,
      })
    })

    it('returns 404 after the users row has been hard-deleted', async () => {
      const admin = await createTestUser({ administrator: true })
      const user = await createTestUser()
      await hardDeleteTestUser(user.id)

      await expect(releaseUserPreservationHold(admin, user.id)).rejects.toMatchObject({
        status: 404,
      })
    })

    it('keeps released holds as history and allows a later hold', async () => {
      const admin = await createTestUser({ administrator: true })
      const user = await createTestUser({ username: safeUsername('hold-history') })
      const first = await placeUserPreservationHold(admin, user.id, 'matter-first')
      await releaseUserPreservationHold(admin, user.id)
      const second = await placeUserPreservationHold(admin, user.id, 'matter-second')

      const history = await listUserPreservationHolds(admin, user.id)

      expect(history.map(hold => [hold.id, hold.reference, hold.released_at === null])).toEqual([
        [second.id, 'matter-second', true],
        [first.id, 'matter-first', false],
      ])
    })
  })

  describe('preservation hold administration is administrator-only', () => {
    it('forbids members, moderators, and anonymous callers from every operation', async () => {
      const admin = await createTestUser({ administrator: true })
      const member = await createTestUser({ username: safeUsername('hold-member') })
      const moderator = await createTestUser({ extraRoles: ['moderator'] })
      const user = await createTestUser({ username: safeUsername('hold-target') })
      await placeUserPreservationHold(admin, user.id, 'matter-guard')

      for (const caller of [member, moderator, null]) {
        await expect(placeUserPreservationHold(caller, user.id, 'x')).rejects.toMatchObject({
          status: 403,
        })
        await expect(releaseUserPreservationHold(caller, user.id)).rejects.toMatchObject({
          status: 403,
        })
        await expect(listUserPreservationHolds(caller, user.id)).rejects.toMatchObject({
          status: 403,
        })
      }
      await expect(deleteUser(user, user)).rejects.toMatchObject({ status: 409 })
    })
  })

  describe('preservation hold reference confidentiality', () => {
    it('never writes the reference to the console or to the audit log', async () => {
      const admin = await createTestUser({ administrator: true })
      const user = await createTestUser({ username: safeUsername('hold-confidential') })
      const secret = 'Subpoena-Ref-7f3a9c'
      const spies = (['debug', 'error', 'info', 'log', 'warn'] as const).map(method =>
        vi.spyOn(console, method).mockReturnValue(undefined),
      )

      await placeUserPreservationHold(admin, user.id, secret)
      await listUserPreservationHolds(admin, user.id)
      await releaseUserPreservationHold(admin, user.id)
      await deleteUser(user, user)

      const logged = JSON.stringify(spies.flatMap(spy => spy.mock.calls))
      expect(logged).not.toContain(secret)
      const audit = await getModeratorActionRowsForTest({ targetUserId: user.id })
      expect(JSON.stringify(audit)).not.toContain(secret)
      for (const spy of spies) spy.mockRestore()
    })
  })
})
