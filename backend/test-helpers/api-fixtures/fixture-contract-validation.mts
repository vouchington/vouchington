import { validateFixtureContracts as validateFixtureContractsFromTooling } from 'vouchington-tooling/api-fixtures'

import { routeShape } from './registered-route-catalog.mts'
import { responseStatusCodesForContract } from './response-contract-status.mts'
import type { BackendResponseContract } from './response-contract-types.mts'
import type { ResolvedApiFixtureCase } from './types.mts'

type FixtureContractValidationCase = Pick<
  ResolvedApiFixtureCase,
  'id' | 'method' | 'route' | 'status' | 'body' | 'backendResponseContractKey'
>

export function validateFixtureContracts(
  fixtureCases: readonly FixtureContractValidationCase[],
  contracts: Record<string, BackendResponseContract>,
): void {
  // Raw binary operations have no JSON fixture case. The local schema adds `format: binary`, while
  // the shared fixture validator only receives and validates JSON-backed operations.
  const jsonFixtureContracts = Object.fromEntries(
    Object.entries(contracts).filter(([, contract]) => {
      const root = contract.schema.root
      return root.type !== 'string' || root.format !== 'binary'
    }),
  )
  const toolingContracts = jsonFixtureContracts as unknown as Parameters<
    typeof validateFixtureContractsFromTooling
  >[1]
  validateFixtureContractsFromTooling(fixtureCases, toolingContracts, {
    routeShape,
    statusCodesForContract: contract =>
      responseStatusCodesForContract(contract as BackendResponseContract),
  })
}
