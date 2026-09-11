import '@data-stores/valkey-core/shutdown'

import { addGracefulShutdownCallback } from '@data-stores/graceful-shutdown'
import onError from '@modules/on-error'
import { workerQueueConnection } from '@data-stores/valkey-core/glide-mq-client'
import { createChannelPubSub as createValkyriesChannelPubSub } from 'valkyries/channel-pubsub'

export type ChannelSubscription<T> = {
  setHandler(handler: ((value: T) => void) | null): void
  close(): void | Promise<void>
}

export type ChannelPubSub<T> = {
  publish(key: string, value: T): Promise<void>
  subscribe(key: string): Promise<ChannelSubscription<T>>
  closeSubscriber(): Promise<void>
  close(): Promise<void>
}

type CreateChannelPubSubOptions<T> = {
  serialize?: (value: T) => string
  deserialize?: (value: string) => T
  closeSubscriberWhenIdle?: boolean
}

export function createChannelPubSub<T>(
  channelPrefix: string,
  options: CreateChannelPubSubOptions<T> = {},
): ChannelPubSub<T> {
  const pubSub = createValkyriesChannelPubSub(channelPrefix, {
    clientConfig: {
      addresses: workerQueueConnection.addresses,
      ...(workerQueueConnection.useTLS ? { useTLS: true } : {}),
      ...(workerQueueConnection.credentials
        ? { credentials: workerQueueConnection.credentials }
        : {}),
    },
    ...(options.serialize ? { serialize: options.serialize } : {}),
    ...(options.deserialize ? { deserialize: options.deserialize } : {}),
    ...(options.closeSubscriberWhenIdle === undefined
      ? {}
      : { closeSubscriberWhenIdle: options.closeSubscriberWhenIdle }),
    onError,
  })

  addGracefulShutdownCallback(() => pubSub.close())

  return pubSub
}
