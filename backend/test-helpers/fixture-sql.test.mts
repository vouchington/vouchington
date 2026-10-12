import { assertLeadingQueryAnnotation } from '@vouchington/postgres'
import rawSql from 'sql-template-strings'
import { describe, expect, it } from 'vitest'

import sql, { allowFixtureQuery } from './fixture-sql.mts'

describe('fixture SQL annotation opt-out', () => {
  it('accepts an unannotated fixture statement and a later append', () => {
    const statement = sql`SELECT 1`
    statement.append(' WHERE FALSE')

    expect(statement.text).toContain('WHERE FALSE')
    expect(allowFixtureQuery(statement)).toBe(statement)
    expect(() => assertLeadingQueryAnnotation(statement)).not.toThrow()
  })

  it('keeps an annotated fixture statement on the checked path', () => {
    const statement = sql`/* readFixture */ SELECT 1`

    expect(allowFixtureQuery(statement)).toBe(statement)
    expect(() => assertLeadingQueryAnnotation(statement)).not.toThrow()
  })

  it('rejects a raw unannotated statement and opts out a raw fixture string', () => {
    const raw = rawSql`SELECT 1`
    expect(() => assertLeadingQueryAnnotation(raw)).toThrow(
      'PostgreSQL query must start with an annotation comment',
    )

    const allowed = allowFixtureQuery('SELECT 1')
    expect(() => assertLeadingQueryAnnotation(allowed)).not.toThrow()
    expect(allowFixtureQuery('/* readFixture */ SELECT 1')).toBe('/* readFixture */ SELECT 1')
  })
})
