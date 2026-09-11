export function encodeCommunityModerationQueueCursor(entry: {
  cursor_created_at: string
  id: string
}): string {
  return Buffer.from(
    JSON.stringify({ created_at: entry.cursor_created_at, id: entry.id }),
  ).toString('base64url')
}

// Match the global reports cursor: created_at must be a microsecond UTC timestamp and
// id a UUID. Without this, malformed cursor fields reach the `::timestamptz`/`::uuid`
// casts in searchCommunityModerationQueue and PostgreSQL raises a 500.
const cursorTimestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function decodeCommunityModerationQueueCursor(after: string): {
  afterCreatedAt: string
  afterId: string
} | null {
  try {
    const decoded = Buffer.from(after, 'base64url').toString('utf8')
    const parsed = JSON.parse(decoded) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'created_at' in parsed &&
      'id' in parsed &&
      typeof (parsed as Record<string, unknown>).created_at === 'string' &&
      typeof (parsed as Record<string, unknown>).id === 'string' &&
      cursorTimestampRegex.test((parsed as Record<string, string>).created_at) &&
      uuidRegex.test((parsed as Record<string, string>).id)
    ) {
      return {
        afterCreatedAt: (parsed as Record<string, string>).created_at,
        afterId: (parsed as Record<string, string>).id,
      }
    }
  } catch {
    // Ignore malformed cursor
  }
  return null
}
