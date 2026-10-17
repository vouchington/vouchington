import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_35_QUEUE_DOMAINS = [
  { key: 'extracted.queues.domainsSection.active_92340695', consumers: ['dotnet', 'swift'] },
  {
    key: 'extracted.queues.domainsSection.backgroundDomains_d956d6be',
    consumers: ['dotnet', 'swift'],
  },
  { key: 'extracted.queues.domainsSection.completed_22a970d2', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.queues.domainsSection.delayed_a5c19c9f', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.queues.domainsSection.failed_031a8f0f', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.queues.domainsSection.pause_858e4ba7', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.queues.domainsSection.pausedReason_41440167', consumers: ['swift'] },
  { key: 'extracted.queues.domainsSection.paused_e159b061', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.queues.domainsSection.resume_d640c742', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.queues.domainsSection.retryFailed_2630f650', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.queues.domainsSection.running_f4ccae29', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.queues.domainsSection.waiting_6e293a8c', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
