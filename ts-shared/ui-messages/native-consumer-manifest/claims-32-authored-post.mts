import type { NativeConsumerManifestEntry } from './types.mts'

/** Public, author, and staff notices for rejected authored posts. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_32_AUTHORED_POST = [
  { key: 'native.authoredPost.removed', consumers: ['dotnet', 'swift'] },
  { key: 'native.authoredPost.noAdditionalReason', consumers: ['dotnet', 'swift'] },
  { key: 'native.authoredPost.unavailable', consumers: ['dotnet', 'swift'] },
  { key: 'native.authoredPost.viewAppeals', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
