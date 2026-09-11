import { beforeAll, describe, expect, it } from 'vitest'

import { checkMonetaryMigration } from './monetary-migration-guard.mts'
import { initSqlAst } from './sql-ast.mts'

describe('monetary migration storage guard', () => {
  beforeAll(() => initSqlAst())

  it('requires integer-unit money columns to use BIGINT storage', () => {
    const errors: string[] = []

    checkMonetaryMigration(
      'backend/data-stores/psql/migrations/9999-money.sql',
      [
        'CREATE TABLE invoices (',
        '  amount_minor_units TEXT,',
        '  cost_microunits UUID,',
        '  fee_minor_units INTEGER,',
        '  currency_code TEXT',
        ');',
      ].join('\n'),
      errors,
    )

    expect(errors).toEqual([
      expect.stringContaining('invoices.amount_minor_units stores integer money as text'),
      expect.stringContaining('invoices.cost_microunits stores integer money as uuid'),
      expect.stringContaining('invoices.fee_minor_units stores integer money as pg_catalog.int4'),
    ])
  })

  it('rejects BIGINT arrays for integer-unit money columns', () => {
    const errors: string[] = []

    checkMonetaryMigration(
      'backend/data-stores/psql/migrations/9999-money.sql',
      [
        'CREATE TABLE invoices (',
        '  amount_minor_units BIGINT[],',
        '  cost_microunits BIGINT[][],',
        '  currency_code TEXT',
        ');',
        'ALTER TABLE invoices ALTER COLUMN amount_minor_units TYPE BIGINT[];',
        'ALTER TABLE payouts ADD COLUMN fee_minor_units BIGINT[];',
        'ALTER TABLE payouts ADD COLUMN currency_code TEXT;',
      ].join('\n'),
      errors,
    )

    expect(errors).toEqual([
      expect.stringContaining(
        'invoices.amount_minor_units stores integer money as pg_catalog.int8[]',
      ),
      expect.stringContaining('invoices.cost_microunits stores integer money as pg_catalog.int8[]'),
      expect.stringContaining(
        'invoices.amount_minor_units stores integer money as pg_catalog.int8[]',
      ),
      expect.stringContaining('payouts.fee_minor_units stores integer money as pg_catalog.int8[]'),
    ])
  })

  it('rejects quoted and schema-qualified custom bigint types', () => {
    const errors: string[] = []

    checkMonetaryMigration(
      'backend/data-stores/psql/migrations/9999-money.sql',
      [
        'CREATE TABLE invoices (',
        '  amount_minor_units "bigint",',
        '  fee_minor_units custom.bigint,',
        '  refund_minor_units "int8",',
        '  currency_code TEXT',
        ');',
        'ALTER TABLE payouts ADD COLUMN cost_microunits "bigint";',
        'ALTER TABLE payouts ADD COLUMN currency_code TEXT;',
      ].join('\n'),
      errors,
    )

    expect(errors).toEqual([
      expect.stringContaining('invoices.amount_minor_units stores integer money as bigint'),
      expect.stringContaining('invoices.fee_minor_units stores integer money as custom.bigint'),
      expect.stringContaining('invoices.refund_minor_units stores integer money as int8'),
      expect.stringContaining('payouts.cost_microunits stores integer money as bigint'),
    ])
  })

  it('allows scalar built-in BIGINT and unquoted int8 columns', () => {
    const errors: string[] = []

    checkMonetaryMigration(
      'backend/data-stores/psql/migrations/9999-money.sql',
      [
        'CREATE TABLE invoices (',
        '  amount_minor_units BIGINT,',
        '  cost_microunits int8,',
        '  currency_code TEXT',
        ');',
      ].join('\n'),
      errors,
    )

    expect(errors).toEqual([])
  })
})
