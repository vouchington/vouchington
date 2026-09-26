import type { TransactionQuery } from '@data-stores/psql'
import { randomUUID } from 'node:crypto'
import { retainPublicationIdentityBridges } from './identity-bridges.mts'
import { preparePostPublicationIdentityBridges } from './prepare-identity-bridges.mts'
import { lockTopicAliasPublicationScopes } from './capture-topic-alias.mts'

const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/** Session-private staging merges bounded native ownership pages without hydrating their full union. */
export async function prepareTopicAliasPublicationIdentityBridges(
  query: TransactionQuery,
  aliasIds: readonly string[],
): Promise<void> {
  const aliases = [...new Set(aliasIds.map(id => id.toLowerCase()))].sort()
  if (!aliases.length) return
  await lockTopicAliasPublicationScopes(query, aliases)
  const table = `pub_alias_posts_${randomUUID().replaceAll('-', '')}`
  await query(
    `/* createPublicationAliasIdentityStaging */ CREATE TEMP TABLE ${table} (post_key UUID PRIMARY KEY) ON COMMIT DROP`,
  )
  for (const alias of aliases) {
    for (const source of ['authored', 'relation'] as const) {
      let cursor = NIL_UUID
      while (true) {
        // oxlint-disable-next-line no-await-in-loop -- each source page is raw-capped before staging/deduplication.
        const { rows }: { rows: Array<{ post_id: string }> } = await query<{ post_id: string }>(
          aliasOwnerPage(source),
          [alias, cursor],
        )
        if (!rows.length) break
        // oxlint-disable-next-line no-await-in-loop -- session-private PK staging deduplicates one bounded source page.
        await query(
          `/* stagePublicationAliasPostIdentities */ INSERT INTO ${table} (post_key)
          SELECT post_id FROM unnest($1::uuid[]) source(post_id) ORDER BY post_id
          -- no-mistakes: deadlock-safe -- random session-private temporary PK has no shared catalog identity.
          ON CONFLICT DO NOTHING`,
          [rows.map(row => row.post_id)],
        )
        cursor = rows.at(-1)!.post_id
      }
    }
  }
  let cursor = NIL_UUID
  while (true) {
    const seek = (after: string) =>
      `SELECT post_key AS post_id FROM ${table} WHERE post_key > ${after} ORDER BY post_key LIMIT 1`
    // oxlint-disable-next-line no-await-in-loop -- globally ordered staged PK pages precede every alias bridge write.
    const { rows }: { rows: Array<{ post_id: string }> } = await query<{ post_id: string }>(
      `/* pagePublicationAliasIdentityStaging */ WITH RECURSIVE page AS (
        SELECT first.*, 1 AS ordinal FROM (${seek('$1::uuid')}) first UNION ALL
        SELECT next.*, page.ordinal+1 FROM page CROSS JOIN LATERAL (${seek('page.post_id')}) next WHERE page.ordinal < 100
      ) SELECT post_id FROM page ORDER BY post_id`,
      [cursor],
    )
    if (!rows.length) break
    // oxlint-disable-next-line no-await-in-loop -- all source post identities are created in one global native UUID order.
    await retainPublicationIdentityBridges(
      query,
      'post',
      rows.map(row => row.post_id),
    )
    cursor = rows.at(-1)!.post_id
  }
  await preparePostPublicationIdentityBridges(
    query,
    aliases.map(topicAliasId => ({
      scope: { type: 'topic_alias' as const, topicAliasId },
      reason: 'post_topics_changed' as const,
    })),
  )
}

function aliasOwnerPage(source: 'authored' | 'relation'): string {
  const table =
    source === 'authored' ? 'post_topic_alias_sources' : 'relation__post__category__topic_alias'
  const scope = source === 'authored' ? 'topic_alias_id' : 'object_id'
  const post = source === 'authored' ? 'post_id' : 'subject_id'
  const order = source === 'authored' ? `${scope} DESC, ${post}` : `${scope}, ${post}`
  const seek = (cursor: string) => `SELECT ${post} AS post_id FROM ${table}
    WHERE ${scope} IS NOT NULL AND (${scope}, ${post}) > ($1::uuid, ${cursor})
      AND (${scope}, ${post}) <= ($1::uuid, '${MAX_UUID}'::uuid)
    ORDER BY ${order} LIMIT 1`
  return `/* pagePublicationAliasSourceIdentities */ WITH RECURSIVE page AS (
    SELECT first.*, 1 AS ordinal FROM (${seek('$2::uuid')}) first UNION ALL
    SELECT next.*, page.ordinal+1 FROM page CROSS JOIN LATERAL (${seek('page.post_id')}) next WHERE page.ordinal < 100
  ) SELECT post_id FROM page ORDER BY post_id`
}
