import { REQUIRED_QUERY_PARAMETER_OVERRIDES } from './required-query-parameter-overrides.mts'

type OperationContract = { parameters: Readonly<Record<string, unknown>> }
type OperationCatalog = Readonly<Record<string, OperationContract>>

export function withRequiredQueryParameters<Catalog extends OperationCatalog>(
  contracts: Catalog,
): Catalog {
  const result = { ...contracts } as Record<string, OperationContract>
  for (const [operation, names] of Object.entries(REQUIRED_QUERY_PARAMETER_OVERRIDES)) {
    const contract = contracts[operation]
    if (!contract) continue
    const parameters = { ...contract.parameters }
    for (const name of names) {
      const descriptor = parameters[name]
      if (!descriptor || typeof descriptor !== 'object')
        throw new Error(`Required query parameter ${operation} ${name} is missing`)
      parameters[name] = { ...descriptor, required: true }
    }
    result[operation] = { ...contract, parameters }
  }
  return result as Catalog
}
