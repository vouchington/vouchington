import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_50_HOUSEHOLD_INVITATION_NOTIFICATION = [
  {
    key: 'notifications.kind.household_invitation.body',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'notifications.kind.household_invitation.title',
    consumers: ['dotnet', 'swift'],
  },
] as const satisfies readonly NativeConsumerManifestEntry[]
