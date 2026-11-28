import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { afterAll, describe, expect, it } from 'vitest'
import {
  entityRelationMetadatum,
  getEntityRelationIntegrityTargetColumn,
} from '@voucha/types/entities/entity-relations-metadata'
import {
  readPartitionChildNames,
  readPublicNonInternalTriggers,
} from '../../../test-helpers/data-stores/psql/schema-catalog.mts'
import {
  readRetainedIdentityLiveForeignKeys,
  readRetainedRelationForeignKeys,
  readRetainedRelationImpactForeignKeys,
} from '../../../test-helpers/data-stores/psql/schema-retained-identities.mts'

const liveRoots = [
  [
    'memberships',
    'retained_membership_identities',
    'trigger_memberships_register_retained_identity',
  ],
  ['users', 'retained_user_identities', 'trigger_register_retained_user_identity'],
  ['api_keys', 'retained_api_key_identities', 'trigger_register_retained_api_key_identity'],
  ['topics', 'retained_topic_identities', 'trigger_register_retained_topic_identity'],
  ['posts', 'retained_post_identities', 'trigger_register_retained_post_identity'],
  [
    'rss_feed_items',
    'retained_rss_feed_item_identities',
    'trigger_register_retained_rss_feed_item_identity',
  ],
] as const

describe('concrete retained entity identities', () => {
  afterAll(() => onGracefulShutdown('SIGTERM'))

  it('registers each live entity through a BEFORE INSERT trigger and restrictive root FK', async () => {
    const constraints = await readRetainedIdentityLiveForeignKeys()
    const triggers = await readPublicNonInternalTriggers([
      'users',
      'api_keys',
      'topics',
      'posts',
      'rss_feed_items',
      'memberships',
    ])
    for (const [live, root, trigger] of liveRoots) {
      expect(constraints).toContainEqual({ owner: live, target: root, delete_action: 'r' })
      expect(triggers).toContainEqual({ owner: live, trigger_name: trigger })
    }
  })

  it('keeps post and RSS item roots in default-backed UUID range partitions', async () => {
    const rows = await readPartitionChildNames([
      'retained_post_identities',
      'retained_rss_feed_item_identities',
    ])
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
    const relations = await readRetainedRelationForeignKeys()
    const impacts = await readRetainedRelationImpactForeignKeys()
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
