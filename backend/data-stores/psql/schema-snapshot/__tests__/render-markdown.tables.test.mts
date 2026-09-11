import { describe, expect, it } from 'vitest'

import { renderSchemaMarkdown } from '../render-markdown.mts'
import type { SchemaSnapshot, SchemaTableSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

function emptySnapshot(): SchemaSnapshot {
  return {
    formatVersion: 2,
    tables: {},
    views: {},
    enums: {},
    extensions: {},
    functions: {},
    policies: {},
  }
}

function widgetsTable(overrides: Partial<SchemaTableSnapshot> = {}): SchemaTableSnapshot {
  return {
    columns: {
      id: {
        type: 'uuid',
        nullable: false,
        defaultExpression: null,
        generatedExpression: null,
        identity: null,
        generated: null,
        collation: null,
        comment: null,
        ordinalPosition: 1,
      },
    },
    relationKind: 'table',
    primaryKey: null,
    uniqueConstraints: {},
    checkConstraints: {},
    foreignKeys: {},
    indexes: {},
    triggers: {},
    comment: null,
    physicalPartition: null,
    partition: null,
    growth: 'bounded',
    ...overrides,
  }
}

describe('renderSchemaMarkdown — tables', () => {
  it('renders a directly indexable README and every non-table section document for an empty snapshot', () => {
    const files = renderSchemaMarkdown(emptySnapshot())

    expect(files.get('README.md')).toContain('# PostgreSQL Schema Snapshot')
    expect(files.get('README.md')).toContain('pnpm run db:snapshot:update')
    expect(files.get('README.md')).toContain('[Views](views.md)')
    expect(files.get('views.md')).toContain('# Views\n\n[Schema index](README.md).\n\n_none_')
    expect(files.get('enums.md')).toContain('_none_')
    expect(files.get('extensions.md')).toContain('| Extension | Version |')
    expect(files.get('functions.md')).toContain('_none_')
    expect(files.get('policies.md')).toContain('_none_')
  })

  it('creates safe alphabetically ordered table leaves linked directly from the index', () => {
    const files = renderSchemaMarkdown({
      ...emptySnapshot(),
      tables: { widgets: widgetsTable(), aardvarks: widgetsTable() },
    })

    expect([...files.keys()]).toEqual([
      'README.md',
      'tables/aardvarks.md',
      'tables/widgets.md',
      'views.md',
      'enums.md',
      'extensions.md',
      'functions.md',
      'policies.md',
    ])
    expect(files.get('README.md')!.indexOf('aardvarks')).toBeLessThan(
      files.get('README.md')!.indexOf('widgets'),
    )
    expect(files.get('tables/widgets.md')).toContain('# Table `widgets`')
    expect(files.get('tables/widgets.md')).toContain('[Schema index](../README.md)')
  })

  it('rejects an unsafe table name before generating a path', () => {
    expect(() =>
      renderSchemaMarkdown({ ...emptySnapshot(), tables: { '../widgets': widgetsTable() } }),
    ).toThrow('safe Markdown filename')
  })

  it('renders table details and exactly one column table per table leaf', () => {
    const files = renderSchemaMarkdown({
      ...emptySnapshot(),
      tables: {
        widgets: widgetsTable({
          comment: 'Bounded widget catalog.',
          primaryKey: { definition: 'PRIMARY KEY (id)', columns: ['id'] },
          uniqueConstraints: {
            widgets_b_key: { definition: 'UNIQUE (b)', columns: ['b'] },
            widgets_a_key: { definition: 'UNIQUE (a)', columns: ['a'] },
          },
          columns: {
            total: {
              type: 'integer',
              nullable: true,
              defaultExpression: null,
              generatedExpression: 'nextval(\n  1\n)',
              identity: 'always',
              generated: 'stored',
              collation: 'C',
              comment: 'Count | running total',
              ordinalPosition: 2,
            },
            id: {
              type: 'uuid',
              nullable: false,
              defaultExpression: null,
              generatedExpression: null,
              identity: null,
              generated: null,
              collation: null,
              comment: null,
              ordinalPosition: 1,
            },
          },
        }),
      },
    })
    const markdown = files.get('tables/widgets.md')!

    expect(markdown).toContain('Bounded widget catalog.')
    expect(markdown).toContain('Not partitioned — growth: bounded.')
    expect(markdown.match(/\| Column \| Type /gu)).toHaveLength(1)
    expect(markdown.indexOf('`id`')).toBeLessThan(markdown.indexOf('`total`'))
    expect(markdown).toContain('nextval(   1 )')
    expect(markdown).toContain('Count \\| running total')
    expect(markdown.indexOf('widgets_a_key')).toBeLessThan(markdown.indexOf('widgets_b_key'))
    expect(markdown).toContain('**Check constraints:**\n_none_')
  })

  it('renders a partition descriptor without partition children', () => {
    const markdown = renderSchemaMarkdown({
      ...emptySnapshot(),
      tables: {
        posts: widgetsTable({
          growth: 'unbounded',
          partition: {
            strategy: 'RANGE',
            key: 'id',
            children: 'monthly',
            retentionOwner: 'cleanupPartitions',
            accessClass: 'retention-window',
          },
        }),
      },
    }).get('tables/posts.md')!

    expect(markdown).toContain(
      'RANGE partitioned on `id` (children: monthly, retention owner `cleanupPartitions`, access class: retention-window, growth: unbounded).',
    )
    expect(markdown).not.toMatch(/posts__p_\d{4}_\d{2}/u)
  })
})
