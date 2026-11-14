import { describe, expect, it } from 'vitest'
import {
  extractStaticSqlTemplateQuasis,
  sourceImportsAndComposesAny,
} from './post-publication-reader-inventory-source.mts'

describe('publication reader SQL configuration', () => {
  it.each([
    [
      '@data-stores/psql',
      [
        'SELECT reader_inventory_placeholder_1 FROM posts WHERE id = reader_inventory_placeholder_1',
      ],
    ],
    ['./unrelated.mts', []],
  ] as const)('uses the configured executor module %s', (module, expected) => {
    const source = `import { readStream as execute } from '${module}'
const query = sql\`SELECT \${column} FROM posts\`
query.append(sql\` WHERE id = \${id}\`)
execute(query)`
    expect(extractStaticSqlTemplateQuasis(source)).toEqual(expected)
  })
})

describe('publication reader canonical imports', () => {
  it.each([
    ['buildDirectPostEligibilityFilter', '@modules/feed-query-builders'],
    ['buildDirectPostAccessFilter', './direct-access-filter.mts'],
    ['buildPublicPostEligibilityFilter', './post-publication-eligibility.mts'],
    ['buildViewerPostDiscoveryEligibilityFilter', '@modules/feed-query-builders'],
  ] as const)('recognizes %s from %s through a local alias', (symbol, module) => {
    const source = `import { ${symbol} as boundary } from '${module}'
query.append(boundary())`
    expect(sourceImportsAndComposesAny(source, [symbol])).toBe(true)
    expect(sourceImportsAndComposesAny(source.replace(module, './unrelated.mts'), [symbol])).toBe(
      false,
    )
  })
})
