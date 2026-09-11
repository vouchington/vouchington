import type { Program, SourceFile, Type, TypeChecker } from 'typescript'
import {
  extractContractSchema as extractContractSchemaFromTooling,
  extractResponseContracts as extractResponseContractsFromTooling,
  validateResponseContract,
} from 'vouchington-tooling/contract-schema'

import type { ExtractedResponseContract } from './contract-schema-types.mts'

export { canonicalContractSchema, hashContractSchema } from './contract-schema-canonical.mts'
export type {
  ContractSchema,
  ContractSchemaNode,
  ContractValidationIssue,
  ExtractedResponseContract,
} from './contract-schema-types.mts'
export { validateResponseContract }

const vouchaExtractOptions = {
  formatAliases: { ApiUuidContract: 'uuid' },
  boundedArrayAlias: 'ApiArrayContract',
} as const

export function extractContractSchema(
  type: Type,
  checker: TypeChecker,
  source: string,
): ExtractedResponseContract {
  return extractContractSchemaFromTooling(
    type,
    checker,
    source,
    vouchaExtractOptions,
  ) as ExtractedResponseContract
}

export function extractResponseContracts(
  program: Program,
  sourceFile: SourceFile,
  registryName?: string,
): Record<string, ExtractedResponseContract> {
  return extractResponseContractsFromTooling(
    program,
    sourceFile,
    registryName,
    vouchaExtractOptions,
  ) as Record<string, ExtractedResponseContract>
}
