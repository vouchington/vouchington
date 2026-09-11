import { describe, expectTypeOf, it } from 'vitest'
import type sql from 'sql-template-strings'

type SQLStatement = import('sql-template-strings').SQLStatement

type ExpectedSqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => SQLStatement

describe('sql-template-strings ambient declaration', () => {
  it('exposes exactly the repository-owned tag and statement types', () => {
    expectTypeOf<typeof sql>().toEqualTypeOf<ExpectedSqlTag>()
    expectTypeOf<keyof SQLStatement>().toEqualTypeOf<
      'text' | 'values' | 'sql' | 'name' | 'append'
    >()
  })
})
