import type {
  CatalogMessage,
  LocalizationConsumer,
  TranslationValue,
} from '@vouchington/localization'
import type { MessageCatalog } from '@vouchington/utils/message-catalog'
import { isMessageDescriptor, type MessageDescriptor } from './message-descriptors.mts'

export type CatalogLeaf = string | MessageDescriptor

const SOURCE_TO_STORED: Record<string, string> = {
  en: 'en-US',
  es: 'es',
  fr: 'fr',
  pt: 'pt',
}

export function catalogTreeFromMessages(
  messages: readonly CatalogMessage[],
  locale: string,
  consumers: readonly LocalizationConsumer[],
): MessageCatalog {
  const stored = SOURCE_TO_STORED[locale] ?? 'en-US'
  const wanted = new Set(consumers)
  const root: Record<string, unknown> = {}
  for (const message of messages) {
    if (!message.consumers.some(consumer => wanted.has(consumer))) continue
    const value = message.translations[stored] ?? message.translations['en-US']
    if (value === undefined) continue
    setLeaf(root, message.id, translationToLeaf(value, message.descriptor))
  }
  return root as MessageCatalog
}

export function catalogTreeFromLeaves(
  messages: Readonly<Record<string, CatalogLeaf>>,
): MessageCatalog {
  const root: Record<string, unknown> = {}
  for (const [id, leaf] of Object.entries(messages)) {
    setLeaf(root, id, leaf)
  }
  return root as MessageCatalog
}

/** Returns the string or descriptor leaf at `key`, or `undefined` when the path is missing or not a leaf. */
export function lookupCatalogLeaf(catalog: MessageCatalog, key: string): CatalogLeaf | undefined {
  let node: unknown = catalog
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null || isMessageDescriptor(node)) return undefined
    const record = node as Record<string, unknown>
    if (!Object.hasOwn(record, segment)) return undefined
    node = record[segment]
  }
  if (typeof node === 'string' || isMessageDescriptor(node)) return node
  return undefined
}

function translationToLeaf(
  value: TranslationValue,
  descriptor: CatalogMessage['descriptor'],
): CatalogLeaf {
  if (descriptor === null) return value as string
  if (descriptor.kind === 'plural') {
    return {
      kind: 'plural',
      valueParameter: descriptor.valueParameter,
      ...(descriptor.numberParameters === undefined
        ? {}
        : { numberParameters: descriptor.numberParameters }),
      forms: value,
    } as CatalogLeaf
  }
  return {
    kind: 'select-plural',
    valueParameter: descriptor.valueParameter,
    selectParameter: descriptor.selectParameter,
    ...(descriptor.numberParameters === undefined
      ? {}
      : { numberParameters: descriptor.numberParameters }),
    cases: value,
  } as CatalogLeaf
}

function setLeaf(root: Record<string, unknown>, id: string, value: CatalogLeaf): void {
  const segments = id.split('.')
  let node = root
  for (const segment of segments.slice(0, -1)) {
    const next = node[segment]
    if (next === undefined || typeof next !== 'object' || next === null) {
      const created: Record<string, unknown> = {}
      node[segment] = created
      node = created
      continue
    }
    node = next as Record<string, unknown>
  }
  const last = segments.at(-1)
  if (last === undefined) return
  node[last] = value
}
