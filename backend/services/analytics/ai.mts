import { emit } from '@data-stores/analytics'

type EmbeddingInvocation = 'single' | 'batch'

type ShortCircuitReason = 'batch_lock' | 'centralized_cache' | 'single_skipped_for_backlog'

interface AIEmbeddingCallOptions {
  service: string
  model: string
  entityType?: string
  tokens: number
  durationMs: number
  success: boolean
  errorType?: string
  invocation?: EmbeddingInvocation
}

interface AIModerationCallOptions {
  service: string
  model: string
  tokens: number
  durationMs: number
  success: boolean
  errorType?: string
}

interface AIEmbeddingShortCircuitOptions {
  reason: ShortCircuitReason
  entityType: string
}

function makeBase() {
  const now = new Date()
  return {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
  }
}

export function trackAIEmbeddingCall({
  service,
  model,
  entityType,
  tokens,
  durationMs,
  success,
  errorType,
  invocation,
}: AIEmbeddingCallOptions): void {
  emit('ai_calls', {
    ...makeBase(),
    kind: 'embedding',
    service,
    model,
    entity_type: entityType,
    tokens,
    duration_ms: durationMs,
    error_type: success ? undefined : (errorType ?? ''),
    invocation,
  })
}

export function trackAIEmbeddingShortCircuit({
  reason,
  entityType,
}: AIEmbeddingShortCircuitOptions): void {
  emit('ai_calls', {
    ...makeBase(),
    kind: 'embedding_short_circuit',
    entity_type: entityType,
    reason,
  })
}

export function trackAIModerationCall({
  service,
  model,
  tokens,
  durationMs,
  success,
  errorType,
}: AIModerationCallOptions): void {
  emit('ai_calls', {
    ...makeBase(),
    kind: 'moderation',
    service,
    model,
    tokens,
    duration_ms: durationMs,
    error_type: success ? undefined : (errorType ?? ''),
  })
}
