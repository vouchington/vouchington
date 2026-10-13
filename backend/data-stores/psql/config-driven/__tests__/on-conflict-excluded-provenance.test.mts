import { parsePostgresSql } from 'no-mistakes'
import { describe, expect, it } from 'vitest'

import {
  isSafeVolatileFallback,
  volatileForm,
} from '../../../../test-helpers/data-stores/psql/config-driven/on-conflict-excluded-provenance.mts'

describe('generated DDL EXCLUDED source provenance', () => {
  it.each([
    'INSERT INTO t VALUES (1, now()) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts;',
    'INSERT INTO t (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts;',
  ])('fails closed when an EXCLUDED source is not explicitly mapped: %s', async sql => {
    const statement = (await parsePostgresSql({ sql })).statements[0]
    if (statement?.kind !== 'insert' || statement.insert.onConflict?.action.kind !== 'doUpdate') {
      throw new Error('Expected a parsed INSERT with DO UPDATE')
    }
    const node = statement.insert.onConflict.action.assignments[0]!.expression

    expect(volatileForm(node, statement.insert)).toBe('EXCLUDED.ts')
    expect(isSafeVolatileFallback(node, statement.insert)).toBe(false)
  })

  it('keeps an explicitly mapped non-volatile source known', async () => {
    const statement = (
      await parsePostgresSql({
        sql: "INSERT INTO t (id, ts) VALUES (1, 'stable') ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts;",
      })
    ).statements[0]
    if (statement?.kind !== 'insert' || statement.insert.onConflict?.action.kind !== 'doUpdate') {
      throw new Error('Expected a parsed INSERT with DO UPDATE')
    }
    const node = statement.insert.onConflict.action.assignments[0]!.expression

    expect(volatileForm(node, statement.insert)).toBeUndefined()
    expect(isSafeVolatileFallback(node, statement.insert)).toBe(true)
  })
})
