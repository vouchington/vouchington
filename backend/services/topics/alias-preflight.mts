import assert from 'http-assert'
import { normalizeTopicAliasInput } from './alias-input.mts'

export function prepareTopicAliasInput(aliases: string | string[]): string[] {
  const normalizedAliases = normalizeTopicAliasInput(aliases)
  assert(
    normalizedAliases.every(alias => alias.length > 0 && alias.length <= 255),
    422,
    'Invalid topic alias',
  )
  return normalizedAliases
}
