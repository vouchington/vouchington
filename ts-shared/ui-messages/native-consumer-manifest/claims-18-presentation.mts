import type { NativeConsumerManifestEntry } from './types.mts'

/** Generic native presentation claims staged for CRM consumer migration. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_18_PRESENTATION = [
  { key: 'native.swift.presentation.phone', consumers: ['swift'] },
  { key: 'native.swift.presentation.provider', consumers: ['swift'] },
  { key: 'native.swift.presentation.type', consumers: ['swift'] },
  { key: 'native.swift.presentation.vertical', consumers: ['swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
