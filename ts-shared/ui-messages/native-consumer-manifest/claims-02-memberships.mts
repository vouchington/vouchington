import type { NativeConsumerManifestEntry } from './types.mts'

/** Membership catalog claims split from claims-02 to keep both files within the line cap. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_02_MEMBERSHIPS = [
  {
    key: 'extracted.memberships.benefitCatalog.access_0c11c1a5',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.benefitCatalog.afterWait_0c11c1b9',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.benefitCatalog.automaticPostTopics_0c11c1ab',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.benefitCatalog.communityAgentRules_0c11c1b5',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.benefitCatalog.contributionCapacity_0c11c1a7',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.benefitCatalog.downvoteCounts_0c11c1b1',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.benefitCatalog.higher_0c11c1bf',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.benefitCatalog.highestPriority_0c11c1c4',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.benefitCatalog.immediate_0c11c1ba',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.benefitCatalog.more_0c11c1bd',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.benefitCatalog.most_0c11c1be',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.benefitCatalog.none_0c11c1bb',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.benefitCatalog.priority_0c11c1c3',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.benefitCatalog.standard_0c11c1bc',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.benefitCatalog.supportServiceLevel_0c11c1c1',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.planComparisonTable.included_ba829a98',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.memberships.planComparisonTable.notIncluded_b665bfc2',
    consumers: ['dotnet', 'swift'],
  },
] as const satisfies readonly NativeConsumerManifestEntry[]
