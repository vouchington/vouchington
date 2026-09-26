import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import {
  createCommunity,
  validateCreateCommunityInput,
  type CreateCommunityInput,
} from '@services/communities'
import { assertCanCreateCommunity } from '@services/communities/authorization'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import { assertNotSuspended } from '@services/users'
import { assertWithinContributionActionLimit } from '@services/contribution-gating/limits'
import { getUserActivePlan } from '@services/memberships'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'

const VALID_MEMBER_ROSTER_VISIBILITIES = ['public', 'users', 'members', 'moderators']

app.route('/api/v1/communities').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities')
  const provenance = getRequestContentProvenance()
  assertNotSuspended(currentUser)
  assertCanCreateCommunity(currentUser)

  const raw = (await ctx.request.json('1mb')) as Record<string, unknown>
  const body = raw as CreateCommunityInput
  body.member_invites_allowed_at = raw.member_invites_allowed_at ? new Date() : null
  body.post_approval_required_at = raw.post_approval_required_at ? new Date() : null
  if ('list_type' in raw) {
    const lt = raw.list_type
    if (lt !== null && lt !== 'follow' && lt !== 'mute') {
      ctx.throw(422, 'list_type must be "follow", "mute", or null')
    }
    body.list_type = lt as 'follow' | 'mute' | null
  }
  if ('member_roster_visibility' in raw) {
    const value = raw.member_roster_visibility
    if (!VALID_MEMBER_ROSTER_VISIBILITIES.includes(value as string)) {
      ctx.throw(422, 'member_roster_visibility must be public, users, members, or moderators')
    }
    body.member_roster_visibility = value as CreateCommunityInput['member_roster_visibility']
  }
  validateCreateCommunityInput(body)
  // ast-grep-ignore: no-three-sequential-awaits -- route handler validates auth/input before dependent mutation or response work
  const membershipPlan = await getUserActivePlan(currentUser.id)
  await verifyCaptchaOrAttestation(ctx, raw, { actionTag: 'communities.create' })
  await assertWithinContributionActionLimit(currentUser, membershipPlan, 'community')

  const community = await createCommunity(provenance, currentUser.id, body)
  const { owner: _owner, ...communityData } = community

  ctx.setStatus(201)
  ctx.json({ community: communityData })
})
