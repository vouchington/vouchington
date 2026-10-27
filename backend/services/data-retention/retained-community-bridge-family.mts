/** The retained community bridge outlives its community until no classifier run references it. */
export const COMMUNITY_BRIDGE_FAMILY = {
  table: 'post_publication_community_identities',
  references: [
    ['communities', 'id'],
    ['classifier_runs', 'community_identity_id'],
  ],
} as const
