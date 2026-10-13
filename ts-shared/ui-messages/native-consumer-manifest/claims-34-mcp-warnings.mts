import type { NativeConsumerManifestEntry } from './types.mts'

/** A completed tool effect must never be presented as an ordinary retryable chat failure. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_34_MCP_WARNINGS = [
  { key: 'native.dotnet.chat.mcpPendingTurnRetryRequired', consumers: ['dotnet'] },
  { key: 'shared.chat.mcpPossibleSideEffect', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
