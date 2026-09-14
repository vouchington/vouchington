import { read } from '@data-stores/psql'

export async function queryRssFeedCurrentState(feedId: string): Promise<{
  is_enabled: boolean
  is_discoverable: boolean
} | null> {
  const { rows } = await read(
    `/* queryRssFeedCurrentState */
    SELECT is_enabled, is_discoverable
    FROM view_rss_feed_current_states
    WHERE rss_feed_id = $1
    `,
    [feedId],
  )

  return rows[0] ?? null
}

export async function queryRssFeedBaseState(feedId: string): Promise<{
  is_enabled: boolean
  is_discoverable: boolean
} | null> {
  const { rows } = await read(
    `/* queryRssFeedBaseState */
    SELECT is_enabled, is_discoverable
    FROM rss_feeds
    WHERE id = $1
    `,
    [feedId],
  )

  return rows[0] ?? null
}

export async function queryRssFeedCurrentStatesViewDefinition(): Promise<string> {
  const { rows } = await read(`/* queryRssFeedCurrentStatesViewDefinition */
    SELECT pg_get_viewdef('view_rss_feed_current_states'::regclass, TRUE) AS definition
  `)

  return rows[0].definition as string
}
