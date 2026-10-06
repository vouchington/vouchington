import { readFileSync } from 'node:fs'
import type { BackendResponseContract } from './response-contract-types.mts'

/** Explicit checked-in response contracts; fixture generation never rediscovers route bodies. */
export const backendResponseContracts = (
  JSON.parse(
    readFileSync(new URL('../../../api-fixtures/v1/manifest.json', import.meta.url), 'utf8'),
  ) as {
    backendResponseContracts: Record<string, BackendResponseContract>
  }
).backendResponseContracts
