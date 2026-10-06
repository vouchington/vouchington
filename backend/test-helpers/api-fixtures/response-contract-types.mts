import type { ContractSchema } from './contract-schema-types.mts'

export type BackendResponseContract = {
  source: string
  method: string
  routeTemplate: string
  hash: string
  schema: ContractSchema
  statusCodes?: readonly number[]
  statusKnowledge?: 'default' | 'explicit' | 'unknown'
  bodyKind?: 'content' | 'none'
  mediaType?: string
  mediaTypeKnowledge?: 'known' | 'none' | 'unknown'
  includeDefaultError?: boolean
  unavailableReason?: string
}

export function routeShape(routeTemplate: string): string {
  return routeTemplate.replace(/:[^/]+/g, ':')
}

export function responseStatusCodesForContract(contract: BackendResponseContract): number[] {
  if (contract.statusKnowledge === 'unknown') return []
  if (contract.statusCodes) return [...new Set(contract.statusCodes)].toSorted((a, b) => a - b)
  const bodyKind = contract.bodyKind ?? (contract.schema.root.type === 'null' ? 'none' : 'content')
  return [bodyKind === 'none' ? 204 : 200]
}
