import type { NativeConsumerManifestEntry } from './types.mts'

/** API-key lifecycle claims shared by native settings surfaces. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_API_KEY_LIFECYCLE = [
  { key: 'native.apiKeys.active', consumers: ['dotnet', 'swift'] },
  { key: 'native.apiKeys.administratorInvalid', consumers: ['dotnet', 'swift'] },
  { key: 'native.apiKeys.expired', consumers: ['dotnet', 'swift'] },
  { key: 'native.apiKeys.expiresAt', consumers: ['dotnet', 'swift'] },
  { key: 'native.apiKeys.lifetime30', consumers: ['dotnet', 'swift'] },
  { key: 'native.apiKeys.lifetime365', consumers: ['dotnet', 'swift'] },
  { key: 'native.apiKeys.lifetime90', consumers: ['dotnet', 'swift'] },
  { key: 'native.apiKeys.lifetimeLabel', consumers: ['dotnet', 'swift'] },
  { key: 'native.apiKeys.lifetimeNone', consumers: ['dotnet', 'swift'] },
  { key: 'native.apiKeys.replaced', consumers: ['dotnet', 'swift'] },
  { key: 'native.apiKeys.revoked', consumers: ['dotnet', 'swift'] },
  { key: 'native.apiKeys.rotate', consumers: ['dotnet', 'swift'] },
  { key: 'native.apiKeys.rotated', consumers: ['dotnet', 'swift'] },
  { key: 'native.apiKeys.rotationConflict', consumers: ['dotnet', 'swift'] },
  { key: 'native.apiKeys.rotationNotFound', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
