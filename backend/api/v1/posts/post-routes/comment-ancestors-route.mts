import app from '../../../app.mts'
import { createVoteClearHandler, createVoteHandler } from '../../../election-vote-handler.mts'
import { postVoteOptions } from '@services/posts/vote-handler-options'
import type { ElectionVoteRequest } from '@voucha/types/entities/election'
import {
  apiNoRequestBody,
  apiOpenApiNoContent,
  apiRequestContract,
} from '@vouchington/utils/api-response-contract'

const postVoteHandler = createVoteHandler(postVoteOptions)

const clearPostVoteHandler = createVoteClearHandler({
  ...postVoteOptions,
  routeKey: 'DELETE:/api/v1/posts/:id/vote',
  requestContractOperation: 'DELETE:/api/v1/posts/:id/vote',
})

app.route('/api/v1/posts/:id/vote').put(async ctx => {
  apiRequestContract<
    'PUT:/api/v1/posts/:id/vote',
    ElectionVoteRequest<'sentiment' | 'recommendation'>
  >('PUT:/api/v1/posts/:id/vote')
  apiOpenApiNoContent('PUT:/api/v1/posts/:id/vote', 204)
  await postVoteHandler(ctx)
})

app.route('/api/v1/posts/:id/vote').delete(async ctx => {
  apiNoRequestBody('DELETE:/api/v1/posts/:id/vote')
  apiOpenApiNoContent('DELETE:/api/v1/posts/:id/vote', 204)
  await clearPostVoteHandler(ctx)
})
