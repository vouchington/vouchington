import type { NativeConsumer, NativeConsumerManifestEntry } from './native-consumer-manifest.mts'
import {
  isDotnetCsharpProductSource,
  isDotnetXamlProductSource,
  isSwiftProductSource,
} from './native-consumer-source-discovery.mts'
import { stripCodeCommentsAndStrings } from './native-source-code-mask.mts'
import { xamlMessageKeys } from './native-xaml-message-keys.mts'

export type NativeProductSource = Readonly<{
  path: string
  content: string
}>

const SWIFT_IDENTIFIER_PREFIX = '(?:common|extracted|native|nav|settings|shared)'
const INTERNAL_VARIANT_SUFFIX = /\.(?:__plural\.(?:one|other)|__select\.[^.]+\.(?:one|other))$/

export function nativeKeyIdentifier(key: string, consumer: NativeConsumer): string {
  const words = key
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1.$2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  const upperFirst = consumer === 'dotnet'
  return words
    .map((word, index) => {
      const normalized = word.toLowerCase()
      return index === 0 && !upperFirst
        ? normalized
        : normalized.charAt(0).toUpperCase() + normalized.slice(1)
    })
    .join('')
}

export function canonicalNativeKey(key: string): string {
  return key.replace(INTERNAL_VARIANT_SUFFIX, '')
}

export function validateNativeConsumerUsage(
  manifest: readonly NativeConsumerManifestEntry[],
  sources: readonly NativeProductSource[],
): void {
  const manifestByKey = new Map(manifest.map(entry => [entry.key, entry]))
  const identifiers = {
    swift: identifierMap(manifest, 'swift'),
    dotnet: identifierMap(manifest, 'dotnet'),
  }
  const uses = new Set<string>()
  const problems: string[] = []

  for (const source of sources) {
    if (isSwiftProductSource(source.path)) {
      const scannable = stripCodeCommentsAndStrings(source.content, false)
      const shorthandMemberPattern = new RegExp(
        `(?<![A-Za-z0-9_.)?])\\.(${SWIFT_IDENTIFIER_PREFIX}[A-Z][A-Za-z0-9]*)\\b`,
        'g',
      )
      for (const match of scannable.matchAll(shorthandMemberPattern)) {
        if (isExplicitNonMessageTypedAssignment(scannable, match.index)) continue
        recordTypedUse('swift', match[1]!, source.path, identifiers.swift, uses, problems)
      }
      const shorthandPattern = new RegExp(
        `\\b(?:localize|string|localized|app|message|UiMessage)\\s*\\(\\s*\\.(${SWIFT_IDENTIFIER_PREFIX}[A-Z][A-Za-z0-9]*)\\b`,
        'g',
      )
      for (const match of scannable.matchAll(shorthandPattern)) {
        recordTypedUse('swift', match[1]!, source.path, identifiers.swift, uses, problems)
      }
      for (const match of scannable.matchAll(/\bUiMessageKey\.([A-Za-z][A-Za-z0-9]*)\b/g)) {
        recordTypedUse('swift', match[1]!, source.path, identifiers.swift, uses, problems)
      }
      const labeledKeyPattern = new RegExp(
        `\\b(?:activeTitle|downLabel|inactiveTitle|label|message|title|upLabel)\\s*:\\s*\\.(${SWIFT_IDENTIFIER_PREFIX}[A-Z][A-Za-z0-9]*)\\b`,
        'g',
      )
      for (const match of scannable.matchAll(labeledKeyPattern)) {
        recordTypedUse('swift', match[1]!, source.path, identifiers.swift, uses, problems)
      }
      const typedAssignmentPattern = new RegExp(
        `:\\s*UiMessageKey\\s*=\\s*\\.(${SWIFT_IDENTIFIER_PREFIX}[A-Z][A-Za-z0-9]*)\\b`,
        'g',
      )
      for (const match of scannable.matchAll(typedAssignmentPattern)) {
        recordTypedUse('swift', match[1]!, source.path, identifiers.swift, uses, problems)
      }
    } else if (isDotnetCsharpProductSource(source.path)) {
      const scannable = stripCodeCommentsAndStrings(source.content, true)
      if (
        /\busing\s+static\s+(?:global::)?Voucha\.Client\.Core\.Localization\.UiMessageKey\s*;/.test(
          scannable,
        )
      ) {
        problems.push(
          `dotnet product source ${source.path} must qualify UiMessageKey references instead of using a static import`,
        )
      }
      for (const match of scannable.matchAll(/\bUiMessageKey\.([A-Z][A-Za-z0-9]*)\b/g)) {
        if (match[1] === 'All') continue
        recordTypedUse('dotnet', match[1]!, source.path, identifiers.dotnet, uses, problems)
      }
    } else if (isDotnetXamlProductSource(source.path)) {
      for (const key of xamlMessageKeys(source.content)) {
        recordRawUse('dotnet', key, source.path, manifestByKey, uses, problems)
      }
    }
  }

  for (const entry of manifest) {
    for (const consumer of entry.consumers) {
      if (!uses.has(usageId(consumer, entry.key))) {
        problems.push(
          `unused ${consumer} manifest claim "${entry.key}" (no product source references it)`,
        )
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Native consumer manifest does not match product usage:\n${problems.sort().join('\n')}`,
    )
  }
}

function identifierMap(
  manifest: readonly NativeConsumerManifestEntry[],
  consumer: NativeConsumer,
): ReadonlyMap<string, string> {
  const result = new Map<string, string>()
  for (const entry of manifest) {
    if (!entry.consumers.includes(consumer)) continue
    const identifier = nativeKeyIdentifier(entry.key, consumer)
    const previous = result.get(identifier)
    if (previous !== undefined && previous !== entry.key) {
      throw new Error(
        `Native ${consumer} key identifier "${identifier}" collides for "${previous}" and "${entry.key}"`,
      )
    }
    result.set(identifier, entry.key)
  }
  return result
}

function recordTypedUse(
  consumer: NativeConsumer,
  identifier: string,
  path: string,
  identifiers: ReadonlyMap<string, string>,
  uses: Set<string>,
  problems: string[],
): void {
  const key = identifiers.get(identifier)
  if (key === undefined) {
    problems.push(`unknown ${consumer} typed message key "${identifier}" in ${path}`)
    return
  }
  uses.add(usageId(consumer, key))
}

function recordRawUse(
  consumer: NativeConsumer,
  rawKey: string,
  path: string,
  manifestByKey: ReadonlyMap<string, NativeConsumerManifestEntry>,
  uses: Set<string>,
  problems: string[],
): void {
  const key = canonicalNativeKey(rawKey)
  const entry = manifestByKey.get(key)
  if (entry === undefined) {
    problems.push(`unknown ${consumer} XAML message key "${rawKey}" in ${path}`)
    return
  }
  if (!entry.consumers.includes(consumer)) {
    problems.push(
      `${consumer} product source ${path} references "${rawKey}", but the manifest claims only ${entry.consumers.join(', ')}`,
    )
    return
  }
  uses.add(usageId(consumer, key))
}

function usageId(consumer: NativeConsumer, key: string): string {
  return `${consumer}:${key}`
}

function isExplicitNonMessageTypedAssignment(source: string, matchIndex: number): boolean {
  const lineStart = source.lastIndexOf('\n', matchIndex - 1) + 1
  const prefix = source.slice(lineStart, matchIndex)
  const assignment = prefix.match(/:\s*([A-Za-z_][A-Za-z0-9_.<>?]*)\s*=\s*$/)
  if (assignment === null) return false
  const normalizedType = assignment[1]!.replace(/\?$/, '').split('.').at(-1)
  return !/^Ui(?:MessageKey|Message|VerbatimText)$/.test(normalizedType ?? '')
}
