import assert from 'http-assert'
import {
  getMyCommunityVacationSettings,
  setMyCommunityVacation,
  setSuppressCommunityDigestsWhileOnVacation,
} from '@services/community-member-vacations'
import type { CommunityModerationHandler } from './community-moderation-contract.mts'
import { communityWithGuard } from './community-moderation-guards.mts'

export const setVacationDigestPreference: CommunityModerationHandler = async (user, args) => {
  const { community } = await communityWithGuard(user, args.community, 'vacation')
  const suppress = args.should_suppress_community_digests_while_on_vacation
  assert(
    typeof suppress === 'boolean',
    422,
    'should_suppress_community_digests_while_on_vacation must be a boolean',
  )
  const updated = await setSuppressCommunityDigestsWhileOnVacation(user.id, {
    communityId: community.id,
    suppress,
  })
  return { should_suppress_community_digests_while_on_vacation: updated }
}

export const setModeratorVacation: CommunityModerationHandler = async (user, args) => {
  const { community } = await communityWithGuard(user, args.community, 'vacation')
  const endsAt = (args.ends_at as string | null | undefined) ?? null
  if (endsAt !== null) {
    assert(!Number.isNaN(Date.parse(endsAt)), 422, 'ends_at must be a valid date string')
    assert(new Date(endsAt) > new Date(), 422, 'ends_at must be in the future')
  }
  await setMyCommunityVacation(user.id, { communityId: community.id, endsAt })
  return getMyCommunityVacationSettings(user.id, { communityId: community.id })
}
