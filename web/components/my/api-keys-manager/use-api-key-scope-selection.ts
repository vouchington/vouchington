import { useState } from 'react'
import type { ScopeCatalogEntry } from '@/types/scopes'
import {
  RSS_KEY_SCOPES,
  scopeResourceRows,
  toggleScope,
  type ScopeResourceRow,
} from './scope-selection'

export type ApiKeyType = 'mcp' | 'rss'

export interface ApiKeyScopeSelection {
  keyType: ApiKeyType
  rows: ScopeResourceRow[]
  mcpScopes: readonly string[]
  /** The scopes the create request sends for the selected key type. */
  permissions: readonly string[]
  handleKeyTypeChange: (keyType: ApiKeyType) => void
  handleScopeToggle: (scope: string, checked: boolean) => void
}

export function useApiKeyScopeSelection(catalog: readonly ScopeCatalogEntry[]) {
  const [keyType, setKeyType] = useState<ApiKeyType>('rss')
  const [mcpScopes, setMcpScopes] = useState<string[]>([])

  const selection: ApiKeyScopeSelection = {
    keyType,
    // API keys are user-audience only: administrator MCP access is OAuth-only.
    rows: scopeResourceRows(catalog, 'api-key', ['user']),
    mcpScopes,
    permissions: keyType === 'rss' ? RSS_KEY_SCOPES : mcpScopes,
    handleKeyTypeChange: setKeyType,
    handleScopeToggle: (scope, checked) =>
      setMcpScopes(prev => toggleScope(catalog, prev, scope, checked)),
  }

  function reset() {
    setKeyType('rss')
    setMcpScopes([])
  }

  return { selection, reset }
}
