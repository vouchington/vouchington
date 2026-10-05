import {
  defineQueryContract,
  queryBoolean,
  queryEnum,
  queryInteger,
  queryString,
} from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import type { FediverseIntegrationStatus } from '@services/fediverse-instances/integration-status'
import { parseBooleanish } from '@ts-shared/utils/query'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

const INTEGRATION_STATUSES = ['pending', 'approved', 'blocked'] as const

export type FediverseInstancesQuery = {
  q?: unknown
  sort?: unknown
  after?: unknown
  limit?: unknown
  software?: unknown
  is_open_for_registrations?: unknown
  integration_status?: unknown
}

export const fediverseInstancesQuery = defineQueryContract({
  q: queryString(),
  sort: queryEnum(['new', 'best', 'relevance']),
  after: queryString(),
  limit: queryInteger({ minimum: 1, maximum: 100, default: 25 }),
  software: queryString(),
  is_open_for_registrations: queryBoolean(),
  integration_status: queryEnum(INTEGRATION_STATUSES),
})

export function parseIntegrationStatus(value: unknown): FediverseIntegrationStatus | undefined {
  return typeof value === 'string' && (INTEGRATION_STATUSES as readonly string[]).includes(value)
    ? (value as FediverseIntegrationStatus)
    : undefined
}

export function prepareFediverseInstanceQuery(
  raw: Readonly<Record<string, unknown>>,
  limit: number,
  integrationStatus: FediverseIntegrationStatus | undefined,
): Record<string, unknown> {
  const prepared = prepareQueryForValidation(raw, fediverseInstancesQuery.queryContract)
  if (raw.limit !== undefined) prepared.limit = limit
  if (raw.software !== undefined) prepared.software = stringFromUnknown(raw.software)
  if (raw.is_open_for_registrations !== undefined)
    prepared.is_open_for_registrations = parseBooleanish(raw.is_open_for_registrations)
  return Object.fromEntries(
    Object.entries(prepared).filter(
      ([key, value]) =>
        (key !== 'software' || value !== undefined) &&
        (key !== 'integration_status' || integrationStatus !== undefined),
    ),
  )
}
