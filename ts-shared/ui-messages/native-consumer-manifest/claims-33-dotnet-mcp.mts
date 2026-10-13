import type { NativeConsumerManifestEntry } from './types.mts'

/** Windows chat MCP connection controls; every claim has a rendered .NET consumer. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_33_DOTNET_MCP = [
  { key: 'native.dotnet.chat.mcpConnect', consumers: ['dotnet'] },
  { key: 'native.dotnet.chat.mcpConnected', consumers: ['dotnet'] },
  { key: 'native.dotnet.chat.mcpConnectionFailed', consumers: ['dotnet'] },
  { key: 'native.dotnet.chat.mcpDisconnect', consumers: ['dotnet'] },
  { key: 'native.dotnet.chat.mcpRefresh', consumers: ['dotnet'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
