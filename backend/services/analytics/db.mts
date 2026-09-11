import { emit } from '@data-stores/analytics'

interface VoteDriftInput {
  entityTable: string
  sampled: number
  drifted: number
  sampleEntityId?: string
}

/** Emit a reconciliation result comparing denormalized vote counters to source-of-truth votes. */
export function trackVoteDrift({
  entityTable,
  sampled,
  drifted,
  sampleEntityId,
}: VoteDriftInput): void {
  const now = new Date()
  emit('pg_vote_drift', {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
    entity_table: entityTable,
    sampled,
    drifted,
    sample_entity_id: sampleEntityId,
  })
}
