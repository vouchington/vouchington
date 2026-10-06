import { describe, expect, it } from 'vitest'
import { extractStaticSqlTemplateQuasis } from './post-publication-reader-inventory-source.mts'

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
