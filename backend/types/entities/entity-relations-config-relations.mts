import type { EntityRelationEntityType } from './entity-relations-config-types.mts'
import type { EntityRelationPredicateType } from './entity-relations-config-predicates.mts'

type EntityRelationOptions = {
  /**
   * Additional SQL index statements to emit after the standard indexes for this relation table.
   * Use this for query-specific indexes on config-generated tables that cannot live in migrations/
   * because the table does not exist until the config-driven generator runs.
   * Each entry must be a complete SQL statement ending with a semicolon.
   */
  extra_indexes?: string[]
}

type EntityRelations = Partial<
  Record<
    EntityRelationEntityType,
    Partial<
      Record<EntityRelationEntityType, Record<EntityRelationPredicateType, EntityRelationOptions>>
    >
  >
>

export const entityRelations: EntityRelations = {
  user: {
    post: {
      save: {},
      follow: {},
      subscribe: {},
      hide: {},
      mentioned: {},
    },
    topic: {
      category: {},
      follow: {},
      block: {},
      mute: {},
      dismiss_recommendation: {},
      subscribe_posts: {},
      subscribe_rss_feed_items: {},
    },
    user: {
      follow: {},
      subscribe: {},
      mute: {},
      block: {},
      dismiss_recommendation: {},
    },
    rss_feed: {
      follow: {
        extra_indexes: [
          // Partial index for time-window queries on rss_feed follow relations.
          // Used by getTrendingRssFeeds to count recent follows within a time window.
          `CREATE INDEX IF NOT EXISTS idx_relation__user__follow__rss_feed__created_at
ON relation__user__follow__rss_feed (created_at, object_id)
WHERE deleted_at IS NULL;`,
        ],
      },
      subscribe: {},
      mute: {},
    },
    rss_feed_item: {
      save: {},
      hide: {},
    },
    url: {
      save: {},
    },
    url_hostname: {
      block: {},
      mute: {},
    },
    community: {
      save: {},
      proxy_follow: {},
      proxy_mute: {},
    },
  },
  post: {
    topic: {
      category: {},
      mentioned: {},
    },
    topic_alias: {
      category: {},
    },
    post: {
      related: {},
      mentioned: {},
    },
    url: {
      related: {},
    },
    user: {
      mentioned: {},
    },
  },
  topic: {
    topic: {
      related: {},
      category: {},
      publisher_type: {},
      parent: {},
    },
    post: {
      faq: {},
      related: {},
      mentioned: {},
    },
    url: {
      related: {},
      faq: {},
      guide: {},
      landing_page: {},
      terms_of_service: {},
    },
  },
  rss_feed_item: {
    topic: {
      category: {},
    },
    topic_alias: {
      category: {},
    },
  },
  community: {
    topic: {
      mute: {},
    },
    url_hostname: {
      mute: {},
    },
  },
  topic_alias: {},
  url: {},
  image: {},
  // Inbound-only: a remote ActivityPub actor following a local user. Written exclusively by the
  // signature-verified inbox receiver (Phase C2) — never reachable from the generic entity-relations
  // API (see the subject_type === 'remote_actor' rejection in api/v1/entity-relations/entity-relations.mts).
  // Outbound (local user -> remote actor) is a separate concern deferred to the delivery phase.
  remote_actor: {
    user: {
      follow: {
        extra_indexes: [
          `CREATE INDEX IF NOT EXISTS idx_relation__remote_actor__follow__user__active_reverse
ON relation__remote_actor__follow__user (object_id, subject_id)
WHERE deleted_at IS NULL;`,
        ],
      },
    },
  },
}
