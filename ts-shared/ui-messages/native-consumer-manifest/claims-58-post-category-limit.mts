import type { NativeConsumerManifestEntry } from './types.mts'

/** Copy native clients show for POST_CATEGORY_LIMIT_REACHED. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_58_POST_CATEGORY_LIMIT = [
  {
    key: 'shared.postCategoryLimit',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
] as const satisfies readonly NativeConsumerManifestEntry[]
