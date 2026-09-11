import contract from '../../../../docs/requirements/navigation/client-intent-parity.json'
import fixtureContract from '../../../../api-fixtures/v1/client-intents.json'
import { NAV_INTENTS } from '@/lib/navigation/intents'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'
import { describe, expect, it } from 'vitest'

describe('client intent parity contract', () => {
  it('keeps the shared API fixture aligned with the docs contract', () => {
    expect(fixtureContract).toEqual(contract)
  })

  it('covers every web nav intent with matching visibility metadata', () => {
    const contractById = new Map(contract.intents.map(intent => [intent.id, intent]))
    const navIds = NAV_INTENTS.map(intent => intent.id)

    expect([...contractById.keys()]).toEqual(navIds)

    for (const intent of NAV_INTENTS) {
      const contracted = contractById.get(intent.id)
      expect(contracted).toBeDefined()
      expect(contracted?.label).toBe(defaultTranslator(intent.label))
      expect(contracted?.requiresAuth).toBe(intent.requiresAuth === true)
      expect(contracted?.roles).toEqual([...(intent.roles ?? [])])
      expect(contracted?.featureFlag).toBe(intent.featureFlag)
    }
  })

  it('gives every intent a native placement for Swift and .NET', () => {
    for (const intent of contract.intents) {
      expect(intent.nativePlacement).toMatch(/^(bottom-nav|staff-directory|account-directory)$/)
      expect(intent.swiftSection).toMatch(/^[a-z][A-Za-z]*$/)
      expect(intent.dotnetSection).toMatch(/^[a-z][A-Za-z]*$/)
    }
  })
})
