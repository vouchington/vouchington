import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import {
  mediaDeliverySafetyWorkConfig,
  mediaDeliverySafetyWorkMaxValues,
} from '@services/media-delivery-safety/work-limits'
import { postsWorkConfig, postsWorkMaxValues } from '@services/posts/work-limits'
import {
  remoteActorsWorkConfig,
  remoteActorsWorkMaxValues,
} from '@services/remote-actors/work-limits'
import { storiesWorkConfig, storiesWorkMaxValues } from '@services/stories/work-limits'
import { topicsWorkConfig, topicsWorkMaxValues } from '@services/topics/work-limits'

export const backgroundWorkRegistryEntries7 = {
  'media-delivery-safety-work-config': defineBoundedWorkNamespace({
    namespace: 'media-delivery-safety-work-config',
    config: mediaDeliverySafetyWorkConfig,
    label: 'Media delivery safety',
    maxValues: mediaDeliverySafetyWorkMaxValues,
    descriptions: {
      recovery_page_size: 'Recovery page size for media delivery safety processing.',
      registry_reconciliation_page_size:
        'Registry reconciliation page size for media delivery safety processing.',
    },
  }),
  'posts-work-config': defineBoundedWorkNamespace({
    namespace: 'posts-work-config',
    config: postsWorkConfig,
    label: 'Posts',
    maxValues: postsWorkMaxValues,
    descriptions: {
      semantic_post_candidate_limit: 'Maximum post candidates in a semantic search window.',
      review_succession_history_audit_page_size:
        'Review succession history audit page size for posts processing.',
      review_succession_candidate_page_size:
        'Review succession candidate page size for posts processing.',
    },
  }),
  'remote-actors-work-config': defineBoundedWorkNamespace({
    namespace: 'remote-actors-work-config',
    config: remoteActorsWorkConfig,
    label: 'Remote actors',
    maxValues: remoteActorsWorkMaxValues,
    descriptions: {
      follower_inbox_batch_size: 'Follower inbox batch size for remote actors processing.',
      distribution_lease_ms: 'Lease duration for one durable follower distribution page.',
    },
  }),
  'stories-work-config': defineBoundedWorkNamespace({
    namespace: 'stories-work-config',
    config: storiesWorkConfig,
    label: 'Stories',
    maxValues: storiesWorkMaxValues,
    descriptions: {
      crawl_effect_page_size: 'Crawl effect page size for stories processing.',
      post_related_url_projection_page_size:
        'Post related url projection page size for stories processing.',
    },
  }),
  'topics-work-config': defineBoundedWorkNamespace({
    namespace: 'topics-work-config',
    config: topicsWorkConfig,
    label: 'Topics',
    maxValues: topicsWorkMaxValues,
    descriptions: {
      alias_post_invalidation_batch_size:
        'Alias post invalidation batch size for topics processing.',
    },
  }),
}
