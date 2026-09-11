import { createQueue } from '@data-stores/valkey-glide-mq'
import { OAUTH_AUTHORIZATION_EXCHANGE_QUEUE_NAME } from './config.mts'

export const oauthAuthorizationExchangeQueue = createQueue(OAUTH_AUTHORIZATION_EXCHANGE_QUEUE_NAME)
