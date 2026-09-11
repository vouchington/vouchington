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
  validateFixtureContractsFromTooling(fixtureCases, contracts, {
    routeShape,
    statusCodesForContract: contract =>
      responseStatusCodesForContract(contract as BackendResponseContract),
  })
}
