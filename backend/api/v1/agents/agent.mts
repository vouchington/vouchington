import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { currentUserCanViewAgents } from '@services/agents/authorization'
import { getAgentByAny } from '@services/agents/get-by-any'
import { getUserPublicByAnyCached } from '@services/entity-fetch'

app.route('/api/v1/agents/:idOrSlug').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanViewAgents, 'GET:/api/v1/agents/:idOrSlug')

  const agent = await getAgentByAny(ctx.params.idOrSlug!)
  ctx.assert(agent, 404, 'Agent not found')

  const user = await getUserPublicByAnyCached(agent.system_user_id)

  ctx.json({ agent, user })
})
