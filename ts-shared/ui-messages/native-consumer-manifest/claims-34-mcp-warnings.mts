import type { NativeConsumerManifestEntry } from './types.mts'

/** Validated responses, tool errors, and ambiguous effects retain distinct native chat status. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_34_MCP_WARNINGS = [
  { key: 'native.dotnet.chat.mcpPendingTurnRetryRequired', consumers: ['dotnet'] },
  { key: 'shared.chat.mcpModelContextStopped', consumers: ['swift'] },
  { key: 'shared.chat.mcpModelProcessingStopped', consumers: ['swift'] },
  { key: 'shared.chat.mcpPossibleSideEffect', consumers: ['dotnet', 'swift'] },
  { key: 'shared.chat.mcpResultNotSaved', consumers: ['swift'] },
  { key: 'shared.chat.mcpResultReceived', consumers: ['swift'] },
  { key: 'shared.chat.mcpToolErrorReceived', consumers: ['swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
