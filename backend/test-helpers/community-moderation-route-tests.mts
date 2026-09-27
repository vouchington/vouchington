/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- registrars live outside *.test.* because jest/no-export forbids exporting them from test files, and oxfmt rewrites it() to test() there */
import { beforeAll, expect, test } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  releaseThroughOtherCommunity,
  sendAcquire,
  sendRelease,
  statusFor,
  type CommunityModerationRouteContext,
  type CommunityModerationRouteOptions,
} from './community-moderation-route-requests.mts'

/** Shared community claim and escalation route cases. Call from a literal `describe`. */
export function registerCommunityModerationRouteTests(
  options: CommunityModerationRouteOptions,
): void {
  let moderator: PrivateUser
  let member: PrivateUser
  let subjectUser: PrivateUser
  let community: CommunityModerationRouteContext['community']

  beforeAll(async () => {
    ;[moderator, member, subjectUser] = (await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])) as PrivateUser[]
    community = await insertTestCommunity({ createdById: moderator.id })
    const memberships = [
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator' as const,
      }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: member.id,
        role: 'member',
      }),
    ]
    if (options.subjectUserIsMember) {
      memberships.push(
        insertTestCommunityMember({
          communityId: community.id,
          userId: subjectUser.id,
          role: 'member',
        }),
      )
    }
    await Promise.all(memberships)
  })

  const context = (): CommunityModerationRouteContext => ({
    moderator,
    member,
    subjectUser,
    community,
    options,
  })
  registerSharedModerationTests(context)
  if (options.action === 'claim') registerClaimTests(context)
  else registerEscalationTests(context)
}

function registerSharedModerationTests(context: () => CommunityModerationRouteContext): void {
  test('returns 401 when not authenticated', async () => {
    const { response } = await sendAcquire(context(), undefined, 401)
    expect(response.status).toBe(401)
  })

  test('returns 403 for a non-moderator member', async () => {
    const ctx = context()
    const { response } = await sendAcquire(ctx, ctx.member, 403)
    expect(response.status).toBe(403)
  })

  test('returns 401 when release is not authenticated', async () => {
    const response = await sendRelease(context(), undefined, 401)
    expect(response.status).toBe(401)
  })

  test('returns 403 when a non-moderator member releases', async () => {
    const ctx = context()
    const response = await sendRelease(ctx, ctx.member, 403)
    expect(response.status).toBe(403)
  })

  test('allows a community moderator to release and returns 204', async () => {
    const ctx = context()
    const acquired = await sendAcquire(ctx, ctx.moderator, statusFor(ctx.options.action))
    expect(acquired.response.status).toBe(statusFor(ctx.options.action))
    const released = await sendRelease(ctx, ctx.moderator, 204, acquired.subjectId)
    expect(released.status).toBe(204)
  })

  test('rejects release through a different community URL', async () => {
    const ctx = context()
    const status = await releaseThroughOtherCommunity(ctx)
    const expected = ctx.options.crossCommunity === 'moderator-404' ? 404 : 403
    expect(status).toBe(expected)
  })
}

function registerClaimTests(context: () => CommunityModerationRouteContext): void {
  test('allows a community moderator to claim the subject and returns claim data', async () => {
    const ctx = context()
    const { response, subjectId } = await sendAcquire(ctx, ctx.moderator, 200)
    expect(response.status).toBe(200)
    expect(response.body.claim).toMatchObject({
      [ctx.options.claimIdField!]: subjectId,
      claimed_by_id: ctx.moderator.id,
    })
    expect(response.body.claimed_by_other).toBe(false)
  })

  test('allows a site staff user to claim the subject', async () => {
    const ctx = context()
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    const { response, subjectId } = await sendAcquire(ctx, staff, 200)
    expect(response.status).toBe(200)
    expect(response.body.claim).toMatchObject({ [ctx.options.claimIdField!]: subjectId })
  })
}

function registerEscalationTests(context: () => CommunityModerationRouteContext): void {
  test('allows a community moderator to escalate the subject and returns 204', async () => {
    const ctx = context()
    const { response } = await sendAcquire(ctx, ctx.moderator, 204)
    expect(response.status).toBe(204)
  })

  test('allows a site staff user to escalate the subject and returns 204', async () => {
    const ctx = context()
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    const { response } = await sendAcquire(ctx, staff, 204)
    expect(response.status).toBe(204)
  })
}
