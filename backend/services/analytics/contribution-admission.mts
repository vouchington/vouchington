import { emit } from '@data-stores/analytics'

/** Records compatibility adoption without retaining request identity, intent, or quota policy. */
export function trackContributionAdmissionIdentity(
  source: string,
  callerSupplied: boolean,
  outcome: 'created' | 'replay' | 'mismatch' | 'in_progress' | 'failed',
  durationMs: number,
): void {
  const now = new Date()
  emit('contribution_admission', {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
    source,
    identity_origin: callerSupplied ? 'caller_supplied' : 'server_generated',
    outcome,
    duration_ms: durationMs,
  })
}
