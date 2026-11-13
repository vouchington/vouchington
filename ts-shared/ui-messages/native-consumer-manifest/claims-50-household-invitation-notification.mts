import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_50_HOUSEHOLD_INVITATION_NOTIFICATION = [
  {
    key: 'settings.householdInvitations.notificationBody',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
  {
    key: 'settings.householdInvitations.notificationTitle',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
] as const satisfies readonly NativeConsumerManifestEntry[]
