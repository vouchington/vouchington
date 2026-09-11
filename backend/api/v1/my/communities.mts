import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import { apiQuery } from '../../response-contract.mts'
import { requireAuth } from '../../response-helpers.mts'
import { getMyCommunityMemberships } from '@services/communities'

const myCommunitiesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

async function handleListMyCommunities(ctx: Context) {
  apiQuery('GET:/api/v1/my/communities', myCommunitiesParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/communities')
  const pagination = myCommunitiesParser.parse(ctx.query)
  const memberships = await getMyCommunityMemberships(currentUser.id, pagination)
  ctx.json(memberships)
}

app.route('/api/v1/my/communities').get(handleListMyCommunities)
