// Keep the imports literal so the runtime migration exports are visible to static analysis.
// The runner still discovers and executes filenames in directory order.
const generators: Record<string, () => Promise<() => string>> = {
  '0000-00-00-entity-elections.mts': async () => {
    const { default: generate } = await import('../config-driven/0000-00-00-entity-elections.mts')
    return generate
  },
  '0000-00-01-entity-relations.mts': async () => {
    const { default: generate } = await import('../config-driven/0000-00-01-entity-relations.mts')
    return generate
  },
  '0000-00-01a-entity-relation-partitions.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0000-00-01a-entity-relation-partitions.mts')
    return generate
  },
  '0000-00-01b-entity-relation-indexes.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0000-00-01b-entity-relation-indexes.mts')
    return generate
  },
  '0000-00-01d-topic-merge-relation-work-items.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0000-00-01d-topic-merge-relation-work-items.mts')
    return generate
  },
  '0005-00-01-seed-topics.mts': async () => {
    const { default: generate } = await import('../config-driven/0005-00-01-seed-topics.mts')
    return generate
  },
  '0010-00-01-seed-agents.mts': async () => {
    const { default: generate } = await import('../config-driven/0010-00-01-seed-agents.mts')
    return generate
  },
  '0010-00-02-seed-admin-user.mts': async () => {
    const { default: generate } = await import('../config-driven/0010-00-02-seed-admin-user.mts')
    return generate
  },
  '0010-00-03-seed-categorizer.mts': async () => {
    const { default: generate } = await import('../config-driven/0010-00-03-seed-categorizer.mts')
    return generate
  },
  '0020-00-01-entity-history-partitions.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0020-00-01-entity-history-partitions.mts')
    return generate
  },
  '0030-00-05-crawl-partitions.mts': async () => {
    const { default: generate } = await import('../config-driven/0030-00-05-crawl-partitions.mts')
    return generate
  },
  '0050-00-01-seed-blacklist-sources.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0050-00-01-seed-blacklist-sources.mts')
    return generate
  },
  '0080-00-01-publisher-type-topics.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0080-00-01-publisher-type-topics.mts')
    return generate
  },
  '0080-00-01a-staging-rss-feeds.mts': async () => {
    const { default: generate } = await import('../config-driven/0080-00-01a-staging-rss-feeds.mts')
    return generate
  },
  '0100-00-01-post-partitions.mts': async () => {
    const { default: generate } = await import('../config-driven/0100-00-01-post-partitions.mts')
    return generate
  },
  '0100-00-02-rss-feed-crawls-partitions.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0100-00-02-rss-feed-crawls-partitions.mts')
    return generate
  },
  '0100-00-03-ledger-partitions.mts': async () => {
    const { default: generate } = await import('../config-driven/0100-00-03-ledger-partitions.mts')
    return generate
  },
  '0100-00-04-ai-usage-monthly-partitions.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0100-00-04-ai-usage-monthly-partitions.mts')
    return generate
  },
  '0140-00-01-seed-communities.mts': async () => {
    const { default: generate } = await import('../config-driven/0140-00-01-seed-communities.mts')
    return generate
  },
  '0190-00-00-hostname-elections-indexes.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0190-00-00-hostname-elections-indexes.mts')
    return generate
  },
  '0510-00-01-user-key-partitions.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0510-00-01-user-key-partitions.mts')
    return generate
  },
  '0530-00-01-user-session-partitions.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0530-00-01-user-session-partitions.mts')
    return generate
  },
  '0635-00-01-classifier-result-partitions.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0635-00-01-classifier-result-partitions.mts')
    return generate
  },
  '0635-00-02-seed-tagging-classifier.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0635-00-02-seed-tagging-classifier.mts')
    return generate
  },
  '0635-00-03-seed-post-classifier.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0635-00-03-seed-post-classifier.mts')
    return generate
  },
  '0635-00-04-seed-community-moderation-classifier.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0635-00-04-seed-community-moderation-classifier.mts')
    return generate
  },
  '0635-00-05-seed-story-clustering-classifier.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0635-00-05-seed-story-clustering-classifier.mts')
    return generate
  },
  '0635-00-06-seed-autotagger-agent-classifier.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0635-00-06-seed-autotagger-agent-classifier.mts')
    return generate
  },
  '0743-00-01-copyright-rationale-retention.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0743-00-01-copyright-rationale-retention.mts')
    return generate
  },
  '0737-00-01-copyright-history-partitions.mts': async () => {
    const { default: generate } =
      await import('../config-driven/0737-00-01-copyright-history-partitions.mts')
    return generate
  },
}

export async function readCanonicalConfigDrivenGenerator(file: string): Promise<string> {
  const load = generators[file]
  if (!load) throw new Error(`Unregistered config-driven generator: ${file}`)
  const generate = await load()
  return generate()
}
