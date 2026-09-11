import type { Context } from '@jongleberry/api-server'
import { getAgentResponseById } from '@services/agent-responses/get'
import { assertCurrentUserCanViewAgentResponse } from '@services/agent-responses/authorization'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

app.route('/api/v1/agent-responses/:id').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/agent-responses/:id')

  const id = ctx.params.id!
  const agentResponse = await getAgentResponseById(id)
  if (!agentResponse) {
    ctx.throw(404, 'Agent response not found')
  }

  assertCurrentUserCanViewAgentResponse(agentResponse, currentUser)

  ctx.json({
    agent_response: agentResponse,
  })
})
