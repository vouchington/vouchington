import app from '../../../app.mts'
import { createVoteClearHandler, createVoteHandler } from '../../../election-vote-handler.mts'
import { topicVoteOptions } from '@services/topics/vote-handler-options'
import {
  apiNoRequestBody,
  apiOpenApiNoContent,
  apiRequestContract,
} from '@vouchington/utils/api-response-contract'
import type { ElectionVoteRequest } from '@voucha/types/entities/election'

const topicVoteHandler = createVoteHandler(topicVoteOptions)
const clearTopicVoteHandler = createVoteClearHandler({
  ...topicVoteOptions,
  routeKey: 'DELETE:/api/v1/topics/:id/vote',
  requestContractOperation: 'DELETE:/api/v1/topics/:id/vote',
})

app.route('/api/v1/topics/:id/vote').put(async ctx => {
  apiRequestContract<'PUT:/api/v1/topics/:id/vote', ElectionVoteRequest<'sentiment'>>(
    'PUT:/api/v1/topics/:id/vote',
  )
  apiOpenApiNoContent('PUT:/api/v1/topics/:id/vote', 204)
  await topicVoteHandler(ctx)
})

app.route('/api/v1/topics/:id/vote').delete(async ctx => {
  apiNoRequestBody('DELETE:/api/v1/topics/:id/vote')
  apiOpenApiNoContent('DELETE:/api/v1/topics/:id/vote', 204)
  await clearTopicVoteHandler(ctx)
})
