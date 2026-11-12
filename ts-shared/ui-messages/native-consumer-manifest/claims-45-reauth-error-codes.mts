import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_45_REAUTH_ERROR_CODES = [
  { key: 'shared.reauthConfirmation.canceled', consumers: ['dotnet', 'swift'] },
  { key: 'shared.reauthConfirmation.chooseAnotherMethod', consumers: ['dotnet', 'swift'] },
  { key: 'shared.reauthConfirmation.expired', consumers: ['dotnet', 'swift'] },
  { key: 'shared.signInMethodRemoval.administratorMfa', consumers: ['dotnet', 'swift'] },
  { key: 'shared.signInMethodRemoval.lastMethod', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
