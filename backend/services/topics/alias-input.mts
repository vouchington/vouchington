import { normalizeKey } from '@ts-shared/utils/strings'
import { normalizeHashtag } from '@ts-shared/utils'

export function normalizeTopicAliasInput(aliases: string | string[]): string[] {
  const values = typeof aliases === 'string' ? aliases.split(/[;,\r\n]+/) : aliases
  return [
    ...new Set(
      values.flatMap(alias => {
        const trimmed = alias.trim()
        if (!trimmed) return []
        if (!trimmed.startsWith('#')) return [normalizeKey(trimmed)]
        return [normalizeHashtag(trimmed)?.key ?? '']
      }),
    ),
  ]
}
