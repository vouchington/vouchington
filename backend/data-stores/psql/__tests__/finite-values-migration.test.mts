import { describe, expect, it } from 'vitest'
import { GENERATED_FINITE_VALUES } from '../finite-values/index.mts'
import createFiniteValueTypes from '../migrations/0000-00-00-0-finite-values.mts'

describe('finite values bootstrap migration generator', () => {
  it('emits an idempotent enum definition and type comment for every generated finite value type', () => {
    const output = createFiniteValueTypes()
    const entries = Object.entries(GENERATED_FINITE_VALUES)

    expect(entries.length).toBeGreaterThan(0)
    expect(output.match(/^DO \$\$ BEGIN$/gm)).toHaveLength(entries.length)

    for (const [name, values] of entries) {
      const labels = values.map(value => `'${value.replaceAll("'", "''")}'`).join(', ')
      expect(output).toContain(`CREATE TYPE ${name} AS ENUM (${labels});`)
      expect(output).toContain(
        `COMMENT ON TYPE ${name} IS 'Canonical closed values for ${name.replaceAll('_', ' ')}.';`,
      )
    }
  })
})
