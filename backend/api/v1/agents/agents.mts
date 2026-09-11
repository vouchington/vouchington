import { streamJsonObject } from '@jongleberry/api-server'
import app from '../../app.mts'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { currentUserCanViewAgents } from '@services/agents/authorization'
import { searchAgents } from '@services/agents/search'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import { indexById } from '@modules/utils'
import { createPaginationParser } from '@modules/pagination'

const agentsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

app.route('/api/v1/agents').get(async ctx => {
  await requireAuthAndRateLimit(ctx, currentUserCanViewAgents, 'GET:/api/v1/agents')

  const paginationOptions = agentsParser.parse(ctx.query)
  const result = await searchAgents(paginationOptions)
  const userIds = result.results.map(a => a.system_user_id)

  const output: Record<string, unknown> = {
    results: result.results,
    page_info: result.page_info,
    users: getUserPublicByAnyCachedBatch(userIds).then(indexById),
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
