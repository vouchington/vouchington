import { describe, expect, it } from 'vitest'

import { renderSchemaMarkdown } from '../render-markdown.mts'

describe('renderSchemaMarkdown header rewrite', () => {
  it('points generated documents at the local snapshot update command and schema.json', () => {
    const files = renderSchemaMarkdown({
      formatVersion: 2,
      tables: {},
      views: {},
      enums: {},
      extensions: {},
      functions: {},
      policies: {},
    })
    const readme = files.get('README.md')

    expect(readme).toContain('pnpm run db:snapshot:update')
    expect(readme).toContain('[schema-snapshot/README.md](../README.md)')
    expect(readme).toContain(
      '[`schema.json`](../../../../../backend/data-stores/psql/schema-snapshot/schema.json)',
    )
    expect([...files.values()].join('\n')).not.toContain('Generated schema snapshot.')
  })
})
