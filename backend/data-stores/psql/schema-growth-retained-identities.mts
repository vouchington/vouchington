import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'

export function sharedParentUuidv7(parentTable: string) {
  return {
    policy: 'uuidv7' as const,
    rationale: `The id is shared with its UUIDv7 ${parentTable} parent row.`,
  }
}

const COMPANION_ID_POLICIES = [
  [
    'copyright_notice_lifecycle_change_rationales',
    sharedParentUuidv7('copyright_notice_lifecycle_changes'),
  ],
] as const

export const RETAINED_ID_POLICIES = [
  ['retained_user_identities', sharedParentUuidv7('users')],
  ['retained_membership_identities', sharedParentUuidv7('memberships')],
  ['retained_api_key_identities', sharedParentUuidv7('api_keys')],
  ['retained_topic_identities', sharedParentUuidv7('topics')],
  ['retained_post_identities', sharedParentUuidv7('posts')],
  ['retained_rss_feed_item_identities', sharedParentUuidv7('rss_feed_items')],
  ['retained_image_identities', sharedParentUuidv7('images')],
  ...entityRelationMetadatum.flatMap(metadata =>
    metadata.election
      ? ([[`retained_${metadata.table_name}`, sharedParentUuidv7(metadata.table_name)]] as const)
      : [],
  ),
] as const

export const SHARED_PARENT_ID_POLICIES = [
  ...RETAINED_ID_POLICIES,
  ...COMPANION_ID_POLICIES,
] as const

export const RETAINED_MISSING_UPDATED_AT = [
  ...RETAINED_ID_POLICIES.map(
    ([table]) =>
      [
        table,
        'Immutable concrete identity owner: rows are inserted once and then deleted by bounded cleanup.',
      ] as const,
  ),
  [
    'retained_image_placement_bindings',
    'Immutable image placement binding: rows are inserted once and then deleted by bounded cleanup.',
  ] as const,
]

export const RETAINED_RELATION_GROWTH_POLICIES = entityRelationMetadatum.flatMap(metadata =>
  metadata.election
    ? ([
        [
          `retained_${metadata.table_name}`,
          'Optional retained relation tuples exist only while deletion impacts pin them; composite subject/id lookups and bounded impact-aware cleanup remain index-selective.',
        ],
      ] as const)
    : [],
)
