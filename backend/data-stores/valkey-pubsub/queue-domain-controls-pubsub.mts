import { createChannelPubSub } from './channel-pubsub.mts'

export type QueueDomainControlChange = { domain: string }

/** The one subscription key; the payload names the domain whose pause state changed. */
export const QUEUE_DOMAIN_CONTROLS_CHANGED_KEY = 'changed'

export const queueDomainControlsPubSub =
  createChannelPubSub<QueueDomainControlChange>('queue-domain-controls')
