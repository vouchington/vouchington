import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { createPaginationParser, defineQueryContract, queryUuid } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import { getStoryById } from '@services/feeds/rss-feed-items/get-story-by-id'
import {
  getStoryMemberPagesBatch,
  type StoryMemberPage,
} from '@services/feeds/rss-feed-items/story-member-pages'
import { hydrateStoryMemberPage } from '@services/stories/story-page-hydration'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import type { Story } from '@services/stories/types'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

const storyMembersParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, default: 25, max: 25 },
})
const storyMembersQuery = defineQueryContract({ exclude_item_id: queryUuid() })
type StoryPageResponse = { story: Story } & StoryMemberPage &
  Awaited<ReturnType<typeof hydrateStoryMemberPage>>

app.route('/api/v1/stories/:id').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/stories/:id', storyMembersParser, storyMembersQuery)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/stories/:id')
  const storyId = ctx.params.id!
  ctx.assert(isUUID(storyId), 400, 'Invalid story ID')
  const { limit, after } = storyMembersParser.parse(ctx.query)
  const exclude_item_id = ctx.query.exclude_item_id as string | undefined
  ctx.assert(
    exclude_item_id === undefined || isUUID(exclude_item_id),
    400,
    'Invalid excluded item ID',
  )
  const query = prepareQueryForValidation(ctx.query, {
    ...storyMembersParser.queryContract,
    ...storyMembersQuery.queryContract,
  })
  validateRequestContract(ctx, 'GET:/api/v1/stories/:id', { query })
  const story = await getStoryById(storyId)
  ctx.assert(story, 404, 'Story not found')
  const page = (
    await getStoryMemberPagesBatch(currentUser, [{ story_id: story.id, exclude_item_id, after }], {
      limit,
    })
  )[story.id]!
  const hydrated = await hydrateStoryMemberPage(currentUser, story.id, page.item_ids)
  const output: StoryPageResponse = { story, ...page, ...hydrated }
  if (!currentUser) ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(apiResponse('GET:/api/v1/stories/:id', output)))
})
