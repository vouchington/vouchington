import { emit, type AuthSessionRecord } from '@data-stores/analytics'

export function trackAuthSessionEvent({
  did,
  sid,
  uid,
  eventType,
}: {
  did: string
  sid: string
  uid: string | null
  eventType: AuthSessionRecord['event_type']
}): void {
  const now = new Date()
  emit('auth_sessions', {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
    event_type: eventType,
    device_id: did,
    session_id: sid,
    user_id: uid ?? undefined,
    authenticated: uid !== null,
  })
}
