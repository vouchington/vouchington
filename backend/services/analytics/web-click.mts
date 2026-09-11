import { emit } from '@data-stores/analytics'

interface LandingPageItemClickOptions {
  pageKind: string
  pageId?: string
  targetKind: string
  targetId?: string
  groupMemberId?: string
  sessionId?: string
  userId?: string
}

export function recordLandingPageItemClick({
  pageKind,
  pageId,
  targetKind,
  targetId,
  groupMemberId,
  sessionId,
  userId,
}: LandingPageItemClickOptions): void {
  const now = new Date()
  emit('web_click', {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
    page_kind: pageKind,
    page_id: pageId,
    target_kind: targetKind,
    target_id: targetId,
    group_member_id: groupMemberId,
    session_id: sessionId,
    user_id: userId,
  })
}
