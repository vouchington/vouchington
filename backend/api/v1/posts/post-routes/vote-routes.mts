import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { createPaginationParser } from '@modules/pagination'
import {
  getPostElectionVotesByElectionId,
  getPostElectionVotesByUserForEntity,
} from '@services/elections-votes/post'
import { getPostByAnyCached } from '@services/entity-fetch'
import { canViewPost } from '@services/posts'
import { isAdminUser } from '@services/users'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { apiQuery } from '../../../response-contract.mts'
import { getRouteAccessPost } from '../get-route-access-post.mts'

const postVotesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 100 },
})

app.route('/api/v1/posts/:id/votes').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/posts/:id/votes', postVotesParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/posts/:id/votes')
  validateRequestContract(ctx, 'GET:/api/v1/posts/:id/votes', { path: ctx.params })
  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid ID')

  const post = await getPostByAnyCached(ctx.params.id!)
  ctx.assert(post, 404, 'Post not found')
  const privacyPost =
    post.post_type === 'topic_recommendation' ? post : await getRouteAccessPost(post)
  ctx.assert(privacyPost, 404, 'Post not found')
  ctx.assert(await canViewPost(currentUser, privacyPost), 404, 'Post not found')

  const { limit, after } = postVotesParser.parse(ctx.query)
  const { after: _rawAfter, ...queryWithoutAfter } = ctx.query
  const query = prepareQueryForValidation(
    after === undefined ? queryWithoutAfter : { ...queryWithoutAfter, after },
    postVotesParser.queryContract,
  )
  if (ctx.query.limit !== undefined) query.limit = limit
  validateRequestContract(ctx, 'GET:/api/v1/posts/:id/votes', { query })

  const collection = isAdminUser(currentUser)
    ? await getPostElectionVotesByElectionId(ctx.params.id!, { limit, after })
    : await getPostElectionVotesByUserForEntity(currentUser.id, ctx.params.id!, { limit, after })
  ctx.json(collection)
})
