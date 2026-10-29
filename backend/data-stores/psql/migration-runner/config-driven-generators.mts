type SqlGeneratorModule = { default: () => string }

// Keep the imports literal so the runtime migration exports are visible to static analysis.
// The runner still discovers and executes filenames in directory order.
const generators: Record<string, () => Promise<SqlGeneratorModule>> = {
  '0000-00-00-entity-elections.mts': () =>
    import('../config-driven/0000-00-00-entity-elections.mts'),
  '0000-00-01-entity-relations.mts': () =>
    import('../config-driven/0000-00-01-entity-relations.mts'),
  '0000-00-01a-entity-relation-partitions.mts': () =>
    import('../config-driven/0000-00-01a-entity-relation-partitions.mts'),
  '0000-00-01b-entity-relation-indexes.mts': () =>
    import('../config-driven/0000-00-01b-entity-relation-indexes.mts'),
  '0000-00-01d-topic-merge-relation-work-items.mts': () =>
    import('../config-driven/0000-00-01d-topic-merge-relation-work-items.mts'),
  '0005-00-01-seed-topics.mts': () => import('../config-driven/0005-00-01-seed-topics.mts'),
  '0010-00-01-seed-agents.mts': () => import('../config-driven/0010-00-01-seed-agents.mts'),
  '0010-00-02-seed-admin-user.mts': () => import('../config-driven/0010-00-02-seed-admin-user.mts'),
  '0010-00-03-seed-categorizer.mts': () =>
    import('../config-driven/0010-00-03-seed-categorizer.mts'),
  '0020-00-01-entity-history-partitions.mts': () =>
    import('../config-driven/0020-00-01-entity-history-partitions.mts'),
  '0030-00-05-crawl-partitions.mts': () =>
    import('../config-driven/0030-00-05-crawl-partitions.mts'),
  '0050-00-01-seed-blacklist-sources.mts': () =>
    import('../config-driven/0050-00-01-seed-blacklist-sources.mts'),
  '0080-00-01-publisher-type-topics.mts': () =>
    import('../config-driven/0080-00-01-publisher-type-topics.mts'),
  '0080-00-01a-staging-rss-feeds.mts': () =>
    import('../config-driven/0080-00-01a-staging-rss-feeds.mts'),
  '0100-00-01-post-partitions.mts': () => import('../config-driven/0100-00-01-post-partitions.mts'),
  '0100-00-02-rss-feed-crawls-partitions.mts': () =>
    import('../config-driven/0100-00-02-rss-feed-crawls-partitions.mts'),
  '0100-00-03-ledger-partitions.mts': () =>
    import('../config-driven/0100-00-03-ledger-partitions.mts'),
  '0140-00-01-seed-communities.mts': () =>
    import('../config-driven/0140-00-01-seed-communities.mts'),
  '0190-00-00-hostname-elections-indexes.mts': () =>
    import('../config-driven/0190-00-00-hostname-elections-indexes.mts'),
  '0510-00-01-user-key-partitions.mts': () =>
    import('../config-driven/0510-00-01-user-key-partitions.mts'),
  '0530-00-01-user-session-partitions.mts': () =>
    import('../config-driven/0530-00-01-user-session-partitions.mts'),
  '0635-00-01-classifier-result-partitions.mts': () =>
    import('../config-driven/0635-00-01-classifier-result-partitions.mts'),
  '0635-00-02-seed-tagging-classifier.mts': () =>
    import('../config-driven/0635-00-02-seed-tagging-classifier.mts'),
  '0635-00-03-seed-post-classifier.mts': () =>
    import('../config-driven/0635-00-03-seed-post-classifier.mts'),
  '0635-00-04-seed-community-moderation-classifier.mts': () =>
    import('../config-driven/0635-00-04-seed-community-moderation-classifier.mts'),
  '0635-00-05-seed-story-clustering-classifier.mts': () =>
    import('../config-driven/0635-00-05-seed-story-clustering-classifier.mts'),
  '0635-00-06-seed-autotagger-agent-classifier.mts': () =>
    import('../config-driven/0635-00-06-seed-autotagger-agent-classifier.mts'),
  '0743-00-01-copyright-rationale-retention.mts': () =>
    import('../config-driven/0743-00-01-copyright-rationale-retention.mts'),
  '0737-00-01-copyright-history-partitions.mts': () =>
    import('../config-driven/0737-00-01-copyright-history-partitions.mts'),
}

export async function readCanonicalConfigDrivenGenerator(file: string): Promise<string> {
  const load = generators[file]
  if (!load) throw new Error(`Unregistered config-driven generator: ${file}`)
  const migrationModule = await load()
  return migrationModule.default()
}
