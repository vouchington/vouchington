import app from '../../app.mts'
import { createVoteClearHandler, createVoteHandler } from '../../election-vote-handler.mts'
import {
  apiNoRequestBody,
  apiOpenApiNoContent,
  apiRequestContract,
} from '../../response-contract.mts'
import { hostnameVoteOptions } from '@services/elections-votes/hostname/vote-handler-options'
import type { ElectionVoteRequest } from '@voucha/types/entities/election'

const hostnameVoteHandler = createVoteHandler(hostnameVoteOptions)
const clearHostnameVoteHandler = createVoteClearHandler({
  ...hostnameVoteOptions,
  routeKey: 'DELETE:/api/v1/hostnames/:id/vote',
  requestContractOperation: 'DELETE:/api/v1/hostnames/:id/vote',
})

app.route('/api/v1/hostnames/:id/vote').put(async ctx => {
  apiRequestContract<'PUT:/api/v1/hostnames/:id/vote', ElectionVoteRequest<'sentiment'>>(
    'PUT:/api/v1/hostnames/:id/vote',
  )
  apiOpenApiNoContent('PUT:/api/v1/hostnames/:id/vote', 204)
  await hostnameVoteHandler(ctx)
})

app.route('/api/v1/hostnames/:id/vote').delete(async ctx => {
  apiNoRequestBody('DELETE:/api/v1/hostnames/:id/vote')
  apiOpenApiNoContent('DELETE:/api/v1/hostnames/:id/vote', 204)
  await clearHostnameVoteHandler(ctx)
})
