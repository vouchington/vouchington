import type { Context } from '@jongleberry/api-server'
import { getAgentResponseById } from '@services/agent-responses/get'
import { assertCurrentUserCanViewAgentResponse } from '@services/agent-responses/authorization'
import { cancelAgentResponse } from '@services/agent-responses/update'
import { ai_agents } from '@queues/ai-agents/queues'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

app.route('/api/v1/agent-responses/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/agent-responses/:id')

  const id = ctx.params.id!
  const agentResponse = await getAgentResponseById(id, { readOnly: false })
  if (!agentResponse) {
    ctx.throw(404, 'Agent response not found')
  }

  assertCurrentUserCanViewAgentResponse(agentResponse, currentUser)

  const jobId = await cancelAgentResponse(agentResponse.id)

  if (jobId) {
    await ai_agents.signal(jobId, 'abort').catch(() => {})
  }

  ctx.setStatus(204)
})
