import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

type Schema = Record<string, unknown>
type Bundle = { components: Record<string, Schema>; operations: Record<string, { body?: Schema }> }

const bundle = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../api-fixtures/v1/request-contracts.json', import.meta.url)),
    'utf8',
  ),
) as Bundle

function kindEnum(operation: string): string[] {
  const body = bundle.operations[operation]?.body
  if (!body) throw new Error(`${operation} is missing its request body`)
  const refName = typeof body.$ref === 'string' ? body.$ref.split('/').at(-1) : undefined
  const schema = refName ? bundle.components[refName] : body
  if (!schema || typeof schema !== 'object') throw new Error(`${operation} has no body schema`)
  const properties = schema.properties as Record<string, Schema> | undefined
  const kinds = properties?.kind?.enum
  if (!Array.isArray(kinds)) throw new Error(`${operation} has no kind enum`)
  return kinds as string[]
}

describe('territorial complaint email request contracts', () => {
  it.each([
    'POST:/api/v1/copyright-email-intakes/:id/correspondence',
    'POST:/api/v1/copyright-email-intakes/:id/correspondence-rejections',
  ])('%s permits complaint and remains a closed enum', operation => {
    const values = kindEnum(operation)
    expect(values.toSorted()).toEqual([
      'appeal',
      'complaint',
      'counter_notice',
      'court_or_ccb_hold',
      'supplement',
      'withdrawal',
    ])
  })
})
