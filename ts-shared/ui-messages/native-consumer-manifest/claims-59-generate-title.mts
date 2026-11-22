import type { NativeConsumerManifestEntry } from './types.mts'

/**
 * Conversation "Generate title" label. Swift already uses it; .NET adopts it for
 * vouchington-clients#774, so the claim stays pending until the .NET button switches over.
 */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_59_GENERATE_TITLE = [
  {
    key: 'native.swift.chat.generateTitle',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
] as const satisfies readonly NativeConsumerManifestEntry[]
