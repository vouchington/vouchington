import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import type { Community } from '../services/communities/types.mts'
import type { PrivateUser } from '../services/users/types.mts'
import type { Response } from 'supertest'

export type CommunityModerationRouteOptions = {
  action: 'claim' | 'escalation'
  resource: 'posts' | 'reports'
  subjectUserIsMember: boolean
  crossCommunity: 'moderator-404' | 'staff-403'
  claimIdField?: 'post_id' | 'report_id'
  createSubject: (input: { community: Community; subjectUser: PrivateUser }) => Promise<string>
}

export type CommunityModerationRouteContext = {
  moderator: PrivateUser
  member: PrivateUser
  subjectUser: PrivateUser
  community: Community
  options: CommunityModerationRouteOptions
}

export function statusFor(action: CommunityModerationRouteOptions['action']): 200 | 204 {
  return action === 'claim' ? 200 : 204
}

function subjectPath(
  ctx: CommunityModerationRouteContext,
  communitySlug: string,
  subjectId: string,
): string {
  return `/api/v1/communities/${communitySlug}/${ctx.options.resource}/${subjectId}/${ctx.options.action}`
}

async function call(
  method: 'put' | 'post' | 'delete',
  url: string,
  user: PrivateUser | undefined,
  status: number,
): Promise<Response> {
  const request = createRequest()
  if (user) await request.authenticateAs(user)
  if (method === 'put') return request.put(url).expect(status)
  if (method === 'post') return request.post(url).expect(status)
  return request.delete(url).expect(status)
}

export async function sendAcquire(
  ctx: CommunityModerationRouteContext,
  user: PrivateUser | undefined,
  status: number,
): Promise<{ response: Response; subjectId: string }> {
  const subjectId = await ctx.options.createSubject({
    community: ctx.community,
    subjectUser: ctx.subjectUser,
  })
  const method = ctx.options.action === 'claim' ? 'put' : 'post'
  const response = await call(method, subjectPath(ctx, ctx.community.slug, subjectId), user, status)
  return { response, subjectId }
}

export async function sendRelease(
  ctx: CommunityModerationRouteContext,
  user: PrivateUser | undefined,
  status: number,
  existingSubjectId?: string,
): Promise<Response> {
  const subjectId =
    existingSubjectId ??
    (await ctx.options.createSubject({
      community: ctx.community,
      subjectUser: ctx.subjectUser,
    }))
  return call('delete', subjectPath(ctx, ctx.community.slug, subjectId), user, status)
}

export async function releaseThroughOtherCommunity(
  ctx: CommunityModerationRouteContext,
): Promise<number> {
  if (ctx.options.crossCommunity === 'moderator-404') {
    const otherCommunity = await insertTestCommunity({ createdById: ctx.moderator.id })
    await insertTestCommunityMember({
      communityId: otherCommunity.id,
      userId: ctx.moderator.id,
      role: 'moderator',
    })
    const acquired = await sendAcquire(ctx, ctx.moderator, statusFor(ctx.options.action))
    const released = await call(
      'delete',
      subjectPath(ctx, otherCommunity.slug, acquired.subjectId),
      ctx.moderator,
      404,
    )
    return released.status
  }

  const staff = await createTestUser({ extraRoles: ['moderator'] })
  const otherCommunity = await insertTestCommunity({ createdById: staff.id })
  const acquired = await sendAcquire(ctx, staff, statusFor(ctx.options.action))
  const released = await call(
    'delete',
    subjectPath(ctx, otherCommunity.slug, acquired.subjectId),
    staff,
    403,
  )
  return released.status
}
