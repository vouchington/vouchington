import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_36_JUDGEMENT_RUNS = [
  { key: 'native.swift.moderationReports.aiJudgementRunExpired', consumers: ['dotnet', 'swift'] },
  { key: 'native.swift.moderationReports.aiJudgementRunFailed', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
