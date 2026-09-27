import { afterAll, describe, expect, it } from 'vitest'
import {
  entityRelationMetadatum,
  getEntityRelationIntegrityTargetColumn,
} from '@voucha/types/entities/entity-relations-metadata'
import { onGracefulShutdown, read } from '../index.mts'

const liveRoots = [
  ['users', 'retained_user_identities'],
  ['topics', 'retained_topic_identities'],
  ['posts', 'retained_post_identities'],
  ['rss_feed_items', 'retained_rss_feed_item_identities'],
] as const

describe('concrete retained entity identities', () => {
  afterAll(onGracefulShutdown)

  it('registers each live entity through a BEFORE INSERT trigger and restrictive root FK', async () => {
    const { rows: constraints } = await read<{
      owner: string
      target: string
      delete_action: string
    }>(`/* readRetainedIdentityLiveForeignKeys */
      SELECT conrelid::regclass::text AS owner, confrelid::regclass::text AS target,
        confdeltype::text AS delete_action
      FROM pg_constraint WHERE contype = 'f' AND conrelid IN
        ('users'::regclass, 'topics'::regclass, 'posts'::regclass, 'rss_feed_items'::regclass)`)
    const { rows: triggers } = await read<{ owner: string; trigger_name: string }>(
      `/* readRetainedIdentityLiveTriggers */
      SELECT tgrelid::regclass::text AS owner, tgname AS trigger_name FROM pg_trigger
      WHERE NOT tgisinternal AND tgrelid IN
        ('users'::regclass, 'topics'::regclass, 'posts'::regclass, 'rss_feed_items'::regclass)`,
    )
    for (const [live, root] of liveRoots) {
      expect(constraints).toContainEqual({ owner: live, target: root, delete_action: 'r' })
      expect(triggers).toContainEqual({
        owner: live,
        trigger_name: `trigger_register_retained_${live === 'rss_feed_items' ? 'rss_feed_item' : live === 'posts' ? 'post' : live === 'topics' ? 'topic' : 'user'}_identity`,
      })
    }
  })

  it('keeps post and RSS item roots in default-backed UUID range partitions', async () => {
    const { rows } = await read<{ parent: string; child: string }>(
      `/* readRetainedIdentityDefaultPartitions */
      SELECT inhparent::regclass::text AS parent, inhrelid::regclass::text AS child
      FROM pg_inherits WHERE inhparent IN
        ('retained_post_identities'::regclass, 'retained_rss_feed_item_identities'::regclass)`,
    )
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          parent: 'retained_post_identities',
          child: 'retained_post_identities_default',
        },
        {
          parent: 'retained_rss_feed_item_identities',
          child: 'retained_rss_feed_item_identities_default',
        },
      ]),
    )
  })

  it('owns every elected relation through a concrete retained pair and exact impact target', async () => {
    const elected = entityRelationMetadatum.filter(metadata => metadata.election)
    const { rows: relations } = await read<{
      owner: string
      target: string
      delete_action: string
    }>(
      `/* readRetainedRelationForeignKeys */
       SELECT conrelid::regclass::text AS owner, confrelid::regclass::text AS target,
         confdeltype::text AS delete_action
       FROM pg_constraint
       WHERE contype = 'f' AND conrelid::regclass::text LIKE 'retained_relation__%'`,
    )
    const { rows: impacts } = await read<{ column_name: string; target: string }>(
      `/* readRetainedRelationImpactForeignKeys */
       SELECT a.attname AS column_name, c.confrelid::regclass::text AS target
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[2]
       WHERE c.contype = 'f' AND c.conrelid = 'user_deletion_relation_impacts'::regclass
         AND array_length(c.conkey, 1) = 2`,
    )
    expect(elected).toHaveLength(17)
    for (const metadata of elected) {
      const retained = `retained_${metadata.table_name}`
      const root = `retained_${metadata.subject_type}_identities`
      expect(relations).toContainEqual({ owner: retained, target: root, delete_action: 'r' })
      expect(impacts).toContainEqual({
        column_name: getEntityRelationIntegrityTargetColumn(metadata),
        target: retained,
      })
    }
  })
})
