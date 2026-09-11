import { beforeAll, describe, expect, it } from 'vitest'

import { checkMonetaryContractFile, checkMonetarySnapshot } from './monetary-contract-guard.mts'
import { checkMonetaryMigration } from './monetary-migration-guard.mts'
import { initSqlAst } from './sql-ast.mts'

describe('monetary contract guard', () => {
  beforeAll(() => initSqlAst())

  it('checks final monetary storage from the generated schema snapshot', () => {
    const errors: string[] = []
    checkMonetarySnapshot(
      {
        tables: {
          invoices: {
            columns: {
              amount_minor_units: { type: 'numeric' },
              currency_code: { type: 'integer' },
            },
          },
        },
      } as never,
      errors,
    )
    expect(errors).toEqual([
      expect.stringContaining('currency_code must be TEXT'),
      expect.stringContaining('amount_minor_units stores integer money as numeric'),
    ])
  })

  it('rejects decimal and floating-point storage for monetary columns', () => {
    const errors: string[] = []

    checkMonetaryMigration(
      'backend/data-stores/psql/migrations/9999-money.sql',
      [
        'CREATE TABLE invoices (',
        '  id UUID PRIMARY KEY,',
        '  annual_fee NUMERIC(10, 2),',
        '  cost_usd DOUBLE PRECISION',
        ');',
      ].join('\n'),
      errors,
    )

    expect(errors).toEqual([
      expect.stringContaining('invoices.annual_fee'),
      expect.stringContaining('invoices.cost_usd'),
    ])
  })

  it('rejects ambiguous cents and dollars column names even when integer-backed', () => {
    const errors: string[] = []

    checkMonetaryMigration(
      'backend/data-stores/psql/migrations/9999-money.sql',
      [
        'CREATE TABLE invoices (',
        '  id UUID PRIMARY KEY,',
        '  price_cents BIGINT,',
        '  total_dollars INTEGER,',
        '  currency_code TEXT',
        ');',
      ].join('\n'),
      errors,
    )

    expect(errors).toEqual([
      expect.stringContaining('invoices.price_cents'),
      expect.stringContaining('invoices.total_dollars'),
    ])
  })

  it('requires integer monetary columns to have a currency association', () => {
    const errors: string[] = []

    checkMonetaryMigration(
      'backend/data-stores/psql/migrations/9999-money.sql',
      [
        'CREATE TABLE invoices (',
        '  id UUID PRIMARY KEY,',
        '  amount_minor_units BIGINT',
        ');',
      ].join('\n'),
      errors,
    )

    expect(errors).toEqual([expect.stringContaining('invoices.amount_minor_units')])
    expect(errors[0]).toContain('currency_code')
  })

  it('does not treat an unrelated currency-like column as a money association', () => {
    const errors: string[] = []
    checkMonetaryMigration(
      'backend/data-stores/psql/migrations/9999-money.sql',
      [
        'CREATE TABLE invoices (',
        '  amount_minor_units BIGINT,',
        '  settlement_currency_code TEXT',
        ');',
      ].join('\n'),
      errors,
    )
    expect(errors).toEqual([expect.stringContaining('invoices.amount_minor_units')])
  })

  it('checks ALTER TABLE ADD COLUMN money definitions', () => {
    const errors: string[] = []
    checkMonetaryMigration(
      'backend/data-stores/psql/migrations/9999-money.sql',
      'ALTER TABLE invoices ADD COLUMN amount_minor_units NUMERIC(10, 2);',
      errors,
    )
    expect(errors).toEqual([
      expect.stringContaining('stores money as pg_catalog.numeric'),
      expect.stringContaining('currency_code'),
    ])
  })

  it('checks ALTER TABLE ALTER COLUMN money and currency definitions', () => {
    const errors: string[] = []
    checkMonetaryMigration(
      'backend/data-stores/psql/migrations/9999-money.sql',
      [
        'ALTER TABLE invoices ALTER COLUMN amount_minor_units TYPE NUMERIC(10, 2);',
        'ALTER TABLE invoices ALTER COLUMN annual_fee TYPE DOUBLE PRECISION;',
        'ALTER TABLE invoices ALTER COLUMN currency_code TYPE INTEGER;',
      ].join('\n'),
      errors,
    )
    expect(errors).toEqual([
      expect.stringContaining('invoices.currency_code must be TEXT'),
      expect.stringContaining('invoices.amount_minor_units stores money as pg_catalog.numeric'),
      expect.stringContaining('invoices.annual_fee stores money as pg_catalog.float8'),
    ])
  })

  it('allows unrelated ALTER TABLE ALTER COLUMN type changes', () => {
    const errors: string[] = []
    checkMonetaryMigration(
      'backend/data-stores/psql/migrations/9999-money.sql',
      [
        'ALTER TABLE invoices ALTER COLUMN confidence TYPE NUMERIC(4, 3);',
        'ALTER TABLE invoices ALTER COLUMN amount_minor_units TYPE BIGINT;',
        'ALTER TABLE invoices ALTER COLUMN currency_code TYPE TEXT;',
      ].join('\n'),
      errors,
    )
    expect(errors).toEqual([])
  })

  it('fails closed when a migration cannot be parsed', () => {
    const errors: string[] = []
    checkMonetaryMigration(
      'backend/data-stores/psql/migrations/9999-money.sql',
      'CREATE TABLE invoices ( amount_minor_units BIGINT,, );',
      errors,
    )
    expect(errors).toEqual([expect.stringContaining('could not parse monetary migration')])
  })

  it('requires currency association columns to use TEXT', () => {
    const errors: string[] = []
    checkMonetaryMigration(
      'backend/data-stores/psql/migrations/9999-money.sql',
      'CREATE TABLE invoices (amount_minor_units BIGINT, currency_code INTEGER);',
      errors,
    )
    expect(errors).toEqual([expect.stringContaining('currency_code must be TEXT')])
  })

  it('allows integer money with record or field-specific currency codes and unrelated analytics', () => {
    const errors: string[] = []

    checkMonetaryMigration(
      'backend/data-stores/psql/migrations/9999-money.sql',
      [
        'CREATE TABLE invoices (',
        '  id UUID PRIMARY KEY,',
        '  amount_minor_units BIGINT,',
        '  currency_code TEXT,',
        '  cost_microunits int8,',
        '  renewal_price_increase_notified_minor_units BIGINT,',
        '  renewal_price_increase_notified_currency_code TEXT,',
        '  confidence NUMERIC(4, 3),',
        '  ranking_score DOUBLE PRECISION',
        ');',
      ].join('\n'),
      errors,
    )

    expect(errors).toEqual([])
  })

  it('rejects legacy and storage-shaped names in public first-party contracts', () => {
    const errors: string[] = []

    checkMonetaryContractFile(
      'backend/api/v1/invoices/index.mts',
      ['export type Invoice = {', '  price_cents: number', '  cost_microunits: number', '}'].join(
        '\n',
      ),
      errors,
    )

    expect(errors).toEqual([
      expect.stringContaining('price_cents'),
      expect.stringContaining('cost_microunits'),
    ])
  })

  it('rejects scalar money values on TypeScript public boundaries', () => {
    const cases = [
      ['web/lib/api/client/cards.ts', 'export type Card = { annual_fee?: string }'],
    ] as const

    for (const [file, content] of cases) {
      const errors: string[] = []
      checkMonetaryContractFile(file, content, errors)
      expect(errors).toEqual([expect.stringContaining('nested Money')])
    }
  })

  it('allows nested Money contracts, non-money decimals, tests, and raw provider payloads', () => {
    const cases = [
      [
        'web/lib/api/client/cards.ts',
        'export type Card = { annual_fee?: Money | null; confidence: number }',
      ],
      ['backend/api/v1/cards/cards.test.mts', 'expect(response.body.price_cents).toBeUndefined()'],
      [
        'backend/modules/stripe/webhook-types.mts',
        'export type RawStripePayload = { amount_cents: number }',
      ],
      ['docs/overview/architecture/monetary-values.md', '`price_cents` is forbidden.'],
    ] as const

    for (const [file, content] of cases) {
      const errors: string[] = []
      checkMonetaryContractFile(file, content, errors)
      expect(errors).toEqual([])
    }
  })
})
