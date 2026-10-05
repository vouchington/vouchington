/** Global worker sweeps must not consume or count another suite's fixtures. */
export const workerSweepIsolatedCases = {
  'topic-alias-standalone-drain': {
    file: 'backend/services/rss-feeds/__tests__/topic-alias-category-mapping-reconciliation.test.mts',
    fullName:
      'topic alias category mapping reconciliation > clears every stale mapping after A to B to standalone before the durable drain',
  },
  'topic-alias-dirty-batch-boundary': {
    file: 'backend/services/rss-feeds/__tests__/topic-alias-category-mapping-reconciliation.test.mts',
    fullName: 'topic alias category mapping reconciliation > drains only 25 dirty rows per run',
  },

  'partition-bootstrap-ddl': {
    file: 'backend/data-stores/psql/migration-runner/monthly-partitions.test.mts',
    fullName:
      'dropRssFeedCrawlsDefaultPartition > drops the leftover default child before creating monthly partitions',
  },
  'expired-crawl-partition-ddl': {
    file: 'backend/data-stores/psql/migration-runner/monthly-partitions.test.mts',
    fullName:
      'cleanupPartitions > clears referral-link crawl pointers before dropping an expired crawls partition',
  },
  'engagement-email-dispatch-1': {
    file: 'backend/services/engagement-emails/dispatch-engagement-emails.test.mts',
    fullName:
      'dispatchEngagementEmails > dispatches follow-topic recommendations based on missing topic follows, not signup age',
  },
  'engagement-email-dispatch-2': {
    file: 'backend/services/engagement-emails/dispatch-engagement-emails.test.mts',
    fullName:
      'dispatchEngagementEmails > dispatches follow-news-sources recommendations to eligible users',
  },
  'engagement-email-dispatch-3': {
    file: 'backend/services/engagement-emails/dispatch-engagement-emails.test.mts',
    fullName:
      'dispatchEngagementEmails > dispatches follow-topic recommendations to eligible users',
  },
  'engagement-email-dispatch-4': {
    file: 'backend/services/engagement-emails/dispatch-engagement-emails.test.mts',
    fullName:
      'dispatchEngagementEmails > dispatches referral-link recommendations to eligible users',
  },
  'engagement-email-dispatch-5': {
    file: 'backend/services/engagement-emails/dispatch-engagement-emails.test.mts',
    fullName:
      'dispatchEngagementEmails > claims follow-topic recipients with no recommendations so later users can be considered',
  },
  'engagement-email-dispatch-6': {
    file: 'backend/services/engagement-emails/dispatch-engagement-emails.test.mts',
    fullName:
      'dispatchEngagementEmails > claims follow-news-source recipients with no recommendations so later users can be considered',
  },

  'story-projection-dispatcher-fairness': {
    file: 'backend/services/stories/__tests__/story-post-related-url-projection-fairness.test.mts',
    fullName:
      'story post related URL projection fairness > rotates dispatcher claims across pending posts',
  },
  'language-backfill-job-names': {
    file: 'backend/workers/language-detection/processors.test.mts',
    fullName:
      'language detection processors > accepts every known language detection backfill job name',
  },
  'language-backfill-non-post': {
    file: 'backend/workers/language-detection/processors.test.mts',
    fullName:
      'language detection processors > backfills non-post entities through the batch processor path',
  },
  'openai-image-quarantine-reconciliation': {
    file: 'backend/workers/openai-moderation/workers/__tests__/workers.test.mts',
    fullName: 'openai moderation single worker > runs image quarantine reconciliation jobs',
  },
} as const
