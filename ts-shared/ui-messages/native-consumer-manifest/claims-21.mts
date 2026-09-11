import type { NativeConsumerManifestEntry } from './types.mts'

/** Canonical native consumer claims, kept in code-point key order. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_21 = [
  {
    key: 'native.swift.routeMetadata.staffCrmContactsCrmContactsDescription',
    consumers: ['swift'],
  },
  { key: 'native.swift.routeMetadata.staffCrmContactsCrmContactsTitle', consumers: ['swift'] },
  {
    key: 'native.swift.routeMetadata.staffCrmContactsEmailHistoryDescription',
    consumers: ['swift'],
  },
  { key: 'native.swift.routeMetadata.staffCrmContactsEmailHistoryTitle', consumers: ['swift'] },
  {
    key: 'native.swift.routeMetadata.staffEngineeringAgentsAgentsDescription',
    consumers: ['swift'],
  },
  { key: 'native.swift.routeMetadata.staffEngineeringAgentsAgentsTitle', consumers: ['swift'] },
  {
    key: 'native.swift.routeMetadata.staffEngineeringAgentsConversationDescription',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffEngineeringAgentsConversationTitle',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffEngineeringAiCostsAiCostsDescription',
    consumers: ['swift'],
  },
  { key: 'native.swift.routeMetadata.staffEngineeringAiCostsAiCostsTitle', consumers: ['swift'] },
  {
    key: 'native.swift.routeMetadata.staffEngineeringDynamicConfigDynamicConfigDescription',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffEngineeringDynamicConfigDynamicConfigTitle',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffEngineeringDynamicConfigFlagsDescription',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffEngineeringDynamicConfigFlagsTitle',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffEngineeringPostgresqlPerformanceDescription',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffEngineeringPostgresqlPerformanceTitle',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffEngineeringPostgresqlPostgresqlDescription',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffEngineeringPostgresqlPostgresqlTitle',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffEngineeringQueuesQueuesDescription',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffEngineeringQueuesQueuesTitle',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffEngineeringValkeyTelemetryDescription',
    consumers: ['swift'],
  },
  { key: 'native.swift.routeMetadata.staffEngineeringValkeyTelemetryTitle', consumers: ['swift'] },
  {
    key: 'native.swift.routeMetadata.staffEngineeringValkeyValkeyDescription',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffEngineeringValkeyValkeyTitle',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffGrowthDashboardAudienceDescription',
    consumers: ['swift'],
  },
  { key: 'native.swift.routeMetadata.staffGrowthDashboardAudienceTitle', consumers: ['swift'] },
  { key: 'native.swift.routeMetadata.staffGrowthDashboardGrowthDescription', consumers: ['swift'] },
  { key: 'native.swift.routeMetadata.staffGrowthDashboardGrowthTitle', consumers: ['swift'] },
  {
    key: 'native.swift.routeMetadata.staffMembershipGrantsGrantAccessDescription',
    consumers: ['swift'],
  },
  { key: 'native.swift.routeMetadata.staffMembershipGrantsGrantAccessTitle', consumers: ['swift'] },
  {
    key: 'native.swift.routeMetadata.staffMembershipGrantsMembershipGrantsDescription',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffMembershipGrantsMembershipGrantsTitle',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffModerationAdminAnalyticsDescription',
    consumers: ['swift'],
  },
  { key: 'native.swift.routeMetadata.staffModerationAdminAnalyticsTitle', consumers: ['swift'] },
  { key: 'native.swift.routeMetadata.staffModerationAdminModLogDescription', consumers: ['swift'] },
  { key: 'native.swift.routeMetadata.staffModerationAdminModLogTitle', consumers: ['swift'] },
  {
    key: 'native.swift.routeMetadata.staffModerationAppealsAppealContextDescription',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffModerationAppealsAppealContextTitle',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffModerationAppealsAppealsDescription',
    consumers: ['swift'],
  },
  { key: 'native.swift.routeMetadata.staffModerationAppealsAppealsTitle', consumers: ['swift'] },
  {
    key: 'native.swift.routeMetadata.staffModerationDisputesDisputesDescription',
    consumers: ['swift'],
  },
  { key: 'native.swift.routeMetadata.staffModerationDisputesDisputesTitle', consumers: ['swift'] },
  {
    key: 'native.swift.routeMetadata.staffModerationDisputesResolutionDescription',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffModerationDisputesResolutionTitle',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffModerationIntegrityAbuseSignalsDescription',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffModerationIntegrityAbuseSignalsTitle',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffModerationIntegrityIntegrityFlagsDescription',
    consumers: ['swift'],
  },
  {
    key: 'native.swift.routeMetadata.staffModerationIntegrityIntegrityFlagsTitle',
    consumers: ['swift'],
  },
] as const satisfies readonly NativeConsumerManifestEntry[]
