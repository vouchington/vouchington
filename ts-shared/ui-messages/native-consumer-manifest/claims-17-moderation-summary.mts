import type { NativeConsumerManifestEntry } from './types.mts'

/** Shared provider-neutral moderation summary claims, kept in code-point key order. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_17_MODERATION_SUMMARY = [
  {
    key: 'native.moderation.summary.disposition.incomplete',
    consumers: ['dotnet', 'swift'],
  },
  { key: 'native.moderation.summary.disposition.none', consumers: ['dotnet', 'swift'] },
  { key: 'native.moderation.summary.disposition.pass', consumers: ['dotnet', 'swift'] },
  { key: 'native.moderation.summary.disposition.reject', consumers: ['dotnet', 'swift'] },
  { key: 'native.moderation.summary.disposition.review', consumers: ['dotnet', 'swift'] },
  {
    key: 'native.moderation.summary.evidence.flaggedCategories',
    consumers: ['dotnet', 'swift'],
  },
  { key: 'native.moderation.summary.evidence.signals', consumers: ['dotnet', 'swift'] },
  { key: 'native.moderation.summary.title', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
