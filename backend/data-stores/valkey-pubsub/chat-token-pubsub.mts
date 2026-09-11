import { createChannelPubSub, type ChannelSubscription } from './channel-pubsub.mts'

export type TokenChunk = {
  type: string
  content?: string
  [key: string]: string | undefined
}

export type ChatTokenSubscription = ChannelSubscription<TokenChunk>

const chatPubSub = createChannelPubSub<TokenChunk>('chat:tokens', {
  closeSubscriberWhenIdle: true,
})

export function publishChatToken(conversationMessageId: string, chunk: TokenChunk): Promise<void> {
  return chatPubSub.publish(conversationMessageId, chunk)
}

export function subscribeChatTokens(conversationMessageId: string): Promise<ChatTokenSubscription> {
  return chatPubSub.subscribe(conversationMessageId)
}

export function closeChatTokenSubscriber(): Promise<void> {
  return chatPubSub.closeSubscriber()
}
