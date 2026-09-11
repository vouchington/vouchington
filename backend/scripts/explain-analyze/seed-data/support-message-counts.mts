import { read } from '@data-stores/psql'

export async function assertSeededSupportMessageCounts(counts: {
  target: { threadId: string; count: number }
  distractor: { threadId: string; count: number }
}): Promise<void> {
  for (const [label, { threadId, count }] of Object.entries(counts)) {
    const { rows } = await read<{ count: string }>(
      `/* assertSeededSupportMessageCount */
        SELECT COUNT(*)::text AS count
        FROM support_messages
        WHERE support_thread_id = $1`,
      [threadId],
    )
    const actual = Number(rows[0]?.count)
    if (actual !== count) {
      throw new Error(
        `Expected ${count} seeded ${label} support messages, found ${Number.isNaN(actual) ? 'no count' : actual}`,
      )
    }
  }
}
