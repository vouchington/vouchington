import { describe, expect, it } from 'vitest'

import { renderSchemaMarkdown } from '../render-markdown.mts'
import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

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

describe('renderSchemaMarkdown — non-table sections', () => {
  it('preserves views, enums, extensions, function signatures, and policies in focused documents', () => {
    const files = renderSchemaMarkdown({
      ...emptySnapshot(),
      views: {
        widget_totals: {
          definition: 'SELECT owner_id FROM widgets',
          comment: 'Per-owner totals.',
          materialized: true,
        },
      },
      enums: { widget_status: { values: ['active', 'archived'] } },
      extensions: { pgcrypto: { version: '1.3' } },
      functions: {
        set_updated_at: {
          definition:
            'CREATE FUNCTION set_updated_at()\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  RETURN NEW;\nEND;\n$function$',
        },
      },
      policies: {
        'widgets.owner_read': {
          table: 'widgets',
          command: 'SELECT',
          pgRoles: ['authenticated'],
          using: 'owner_id = current_user_id()',
          withCheck: null,
        },
      },
    })

    expect(files.get('views.md')).toContain('## `widget_totals` (materialized)')
    expect(files.get('views.md')).toContain('Per-owner totals.')
    expect(files.get('enums.md')).toContain('- `active`')
    expect(files.get('extensions.md')).toContain('| `pgcrypto` | 1.3 |')
    expect(files.get('functions.md')).toContain('CREATE FUNCTION set_updated_at()')
    expect(files.get('functions.md')).not.toContain('RETURN NEW;')
    expect(files.get('policies.md')).toContain('- using: `owner_id = current_user_id()`')
  })
})
