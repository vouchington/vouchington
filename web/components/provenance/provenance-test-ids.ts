/** The entities whose provenance badges render, one prefix each for their `data-pw` ids. */
export type ProvenanceTestIdPrefix = 'post' | 'community' | 'topic' | 'list' | 'source'

interface ProvenanceTestIds {
  badge: string
  channel: string
  client: string
  clientVerification: string
}

/**
 * Every id is written out whole, so a search for one finds the component that renders it and the
 * Playwright spec that asserts it.
 */
export const PROVENANCE_TEST_IDS = {
  post: {
    badge: 'post-provenance-badge',
    channel: 'post-provenance-channel',
    client: 'post-provenance-client',
    clientVerification: 'post-provenance-client-verification',
  },
  community: {
    badge: 'community-provenance-badge',
    channel: 'community-provenance-channel',
    client: 'community-provenance-client',
    clientVerification: 'community-provenance-client-verification',
  },
  topic: {
    badge: 'topic-provenance-badge',
    channel: 'topic-provenance-channel',
    client: 'topic-provenance-client',
    clientVerification: 'topic-provenance-client-verification',
  },
  list: {
    badge: 'list-provenance-badge',
    channel: 'list-provenance-channel',
    client: 'list-provenance-client',
    clientVerification: 'list-provenance-client-verification',
  },
  source: {
    badge: 'source-provenance-badge',
    channel: 'source-provenance-channel',
    client: 'source-provenance-client',
    clientVerification: 'source-provenance-client-verification',
  },
} as const satisfies Record<ProvenanceTestIdPrefix, ProvenanceTestIds>
