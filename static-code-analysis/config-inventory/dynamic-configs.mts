import { addToMapSet, sorted } from './shared.mts'
import type { DynamicConfigInventoryRow } from './types.mts'

const DYNAMIC_CONFIG_KEY_PATTERN = /\bkey:\s*(?:'([^']+)'|"([^"]+)"|([A-Z0-9_]+))[\s,\n]/
const DYNAMIC_CONFIG_START_PATTERN = /\bnew\s+DynamicConfig\s*\(\s*\{/g
const STRING_CONSTANT_PATTERN = /(?:export\s+)?const\s+([A-Z0-9_]+)\s*=\s*['"]([^'"]+)['"]/g
const MAX_DYNAMIC_CONFIG_SCAN_LINES = 80
const MAX_DYNAMIC_CONFIG_SCAN_CHARS = 2000

export function collectDynamicConfigsFromFile(
  file: string,
  source: string,
  definitions: Map<string, Set<string>>,
  registry: Map<string, Set<string>>,
): void {
  if (!file.endsWith('.mts') || file.includes('.test.') || file.includes('.mock.')) return

  const constants = new Map<string, string>()
  for (const match of source.matchAll(STRING_CONSTANT_PATTERN)) constants.set(match[1], match[2])

  for (const match of matchDynamicConfigKeys(source)) {
    const key = match[1] ?? match[2] ?? constants.get(match[3] ?? '') ?? null
    if (!key) continue
    addToMapSet(definitions, stripDynamicConfigPrefix(key), file)
  }

  if (
    file === 'backend/services/dynamic-config-admin/registry.mts' ||
    file.startsWith('backend/services/dynamic-config-admin/registry-')
  ) {
    for (const match of source.matchAll(/\bnamespace:\s*'([^']+)'/g)) {
      addToMapSet(registry, match[1], file)
    }
  }
}

function matchDynamicConfigKeys(source: string): RegExpMatchArray[] {
  return [...source.matchAll(DYNAMIC_CONFIG_START_PATTERN)].flatMap(match => {
    const snippet = source
      .slice(match.index, match.index + MAX_DYNAMIC_CONFIG_SCAN_CHARS)
      .split('\n')
      .slice(0, MAX_DYNAMIC_CONFIG_SCAN_LINES)
      .join('\n')
    const keyMatch = snippet.match(DYNAMIC_CONFIG_KEY_PATTERN)
    return keyMatch ? [keyMatch] : []
  })
}

export function mergeDynamicConfigRows(
  definitions: Map<string, Set<string>>,
  registry: Map<string, Set<string>>,
): DynamicConfigInventoryRow[] {
  const namespaces = new Set([...definitions.keys(), ...registry.keys()])
  return [...namespaces]
    .toSorted((a, b) => a.localeCompare(b))
    .map(namespace => ({
      namespace,
      definitionFiles: sorted(definitions.get(namespace) ?? new Set()),
      registryFiles: sorted(registry.get(namespace) ?? new Set()),
    }))
}

function stripDynamicConfigPrefix(key: string): string {
  const prefix = 'dynamic-config:'
  return key.startsWith(prefix) ? key.slice(prefix.length) : key
}
