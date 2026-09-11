import { createChannelPubSub, type ChannelSubscription } from './channel-pubsub.mts'

export type AgentResponseEvent =
  | { type: 'progress'; content?: string; tool_name?: string }
  | { type: 'summary'; content?: string }
  | { type: 'done'; content?: string }
  | { type: 'error'; error?: string }

export type AgentResponseSubscription = ChannelSubscription<AgentResponseEvent>

const agentResponsePubSub = createChannelPubSub<AgentResponseEvent>('agent-responses:events')

export function publishAgentResponseEvent(
  agentResponseId: string,
  chunk: AgentResponseEvent,
): Promise<void> {
  return agentResponsePubSub.publish(agentResponseId, chunk)
}

export function subscribeAgentResponseEvents(
  agentResponseId: string,
): Promise<AgentResponseSubscription> {
  return agentResponsePubSub.subscribe(agentResponseId)
}

export function closeAgentResponseSubscriber(): Promise<void> {
  return agentResponsePubSub.closeSubscriber()
}
