import { describe, expect, it } from 'vitest'
import { aliasChange } from './alias-facts.mts'
import { boolPair, enumPair, textPair, timePair } from './topic-revision-pairs.mts'

describe('topic revision pair guards', () => {
  it('rejects values that are not the declared pair type', () => {
    expect(() => textPair({ name: { before: null, after: 1 } }, 'name')).toThrow('text or null')
    expect(() =>
      enumPair({ topic_type: { before: null, after: 'nope' } }, 'topic_type', new Set(['topic'])),
    ).toThrow('unknown value')
    expect(() => boolPair({ noindex: { before: null, after: 1 } }, 'noindex')).toThrow(
      'boolean or null',
    )
    expect(() =>
      timePair({ deleted_at: { before: null, after: 'yesterday' } }, 'deleted_at'),
    ).toThrow('timestamp')
  })

  it('rejects malformed alias facts', () => {
    expect(() => aliasChange({ topic_aliases: { before: 'cards', after: null } })).toThrow(
      'array of strings',
    )
    expect(() => aliasChange({ topic_alias_link: { before: { alias: 1 }, after: null } })).toThrow(
      'alias text',
    )
    expect(() =>
      aliasChange({ topic_alias_link: { before: { alias: 'cards', id: 1 }, after: null } }),
    ).toThrow('alias id')
  })
})
