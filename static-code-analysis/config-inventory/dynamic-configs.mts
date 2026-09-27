import type { DynamicConfigReference } from './types.mts'

const DYNAMIC_CONFIG_KEY_PATTERN = /\bkey:\s*(?:'([^']+)'|"([^"]+)"|([A-Z0-9_]+))[\s,\n]/
const DYNAMIC_CONFIG_START_PATTERN = /\bnew\s+DynamicConfig\s*\(\s*\{/g
const STRING_CONSTANT_PATTERN = /(?:export\s+)?const\s+([A-Z0-9_]+)\s*=\s*['"]([^'"]+)['"]/g
const MAX_DYNAMIC_CONFIG_SCAN_LINES = 80
const MAX_DYNAMIC_CONFIG_SCAN_CHARS = 2000

/** Recognizes Vouchington DynamicConfig constructors and the admin registry. */
export function collectDynamicConfigReferences(
  file: string,
  source: string,
): DynamicConfigReference[] {
  if (!file.endsWith('.mts') || file.includes('.test.') || file.includes('.mock.')) return []

  const references: DynamicConfigReference[] = []
  const constants = new Map<string, string>()
  for (const match of source.matchAll(STRING_CONSTANT_PATTERN)) {
    const constantName = match[1]
    const constantValue = match[2]
    if (constantName && constantValue) constants.set(constantName, constantValue)
  }

  for (const match of matchDynamicConfigKeys(source)) {
    const key = match[1] ?? match[2] ?? constants.get(match[3] ?? '') ?? null
    if (!key) continue
    references.push({ namespace: stripDynamicConfigPrefix(key), kind: 'definition' })
  }

  if (
    file === 'backend/services/dynamic-config-admin/registry.mts' ||
    file.startsWith('backend/services/dynamic-config-admin/registry-')
  ) {
    for (const match of source.matchAll(/\bnamespace:\s*'([^']+)'/g)) {
      const namespace = match[1]
      if (namespace) references.push({ namespace, kind: 'registry' })
    }
  }

  return references
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

function stripDynamicConfigPrefix(key: string): string {
  const prefix = 'dynamic-config:'
  return key.startsWith(prefix) ? key.slice(prefix.length) : key
}
