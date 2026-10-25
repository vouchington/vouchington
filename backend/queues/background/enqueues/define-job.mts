import { getBackgroundOrderingConcurrency, type BackgroundDomain } from '../config.mts'
import type {
  BackgroundDomainDefinition,
  BackgroundJobDefinition,
  BackgroundJobSpec,
} from '../types.mts'
import type {
  HasSensitiveFields,
  NoSensitiveFields,
} from '@data-stores/valkey-glide-mq/glide-mq-payload-types'

const LOCAL_NAME = /^[a-z][A-Za-z0-9_-]*$/

export function defineBackgroundDomain(
  definition: BackgroundDomainDefinition,
): BackgroundDomainDefinition {
  assertPositiveInteger(`${definition.domain} workerConcurrency`, definition.workerConcurrency)
  return definition
}

export function defineBackgroundJob<TData = Record<string, never>>(
  domain: BackgroundDomainDefinition,
  spec: BackgroundJobSpec & { sensitive: true },
): BackgroundJobDefinition<TData, true> & { sensitive: true }
export function defineBackgroundJob<TData = Record<string, never>>(
  domain: BackgroundDomainDefinition,
  spec: BackgroundJobSpec &
    ([TData] extends [NoSensitiveFields<TData>]
      ? [true] extends [HasSensitiveFields<TData>]
        ? never
        : { sensitive?: undefined }
      : never),
): BackgroundJobDefinition<TData, false>
export function defineBackgroundJob<TData = Record<string, never>>(
  domain: BackgroundDomainDefinition,
  spec: BackgroundJobSpec,
): BackgroundJobDefinition<TData> {
  if (!LOCAL_NAME.test(spec.name)) {
    throw new TypeError(`Background job name "${spec.name}" must not contain a domain or dot`)
  }
  if (!Number.isInteger(spec.priority) || spec.priority < 1 || spec.priority > 2048) {
    throw new RangeError(`Background job ${domain.domain}.${spec.name} needs priority 1..2048`)
  }
  for (const [label, value] of [
    ['attempts', spec.attempts],
    ['lockDuration', spec.lockDuration],
    ['timeout', spec.timeout],
  ] as const) {
    if (value !== undefined) assertPositiveInteger(`${spec.name} ${label}`, value)
  }
  const { name, sensitive, ...jobOptions } = spec
  const ordering = spec.ordering ?? {
    key: domain.domain,
    ...(domain.rateLimit ? { rateLimit: domain.rateLimit } : {}),
  }
  return {
    name: `${domain.domain}.${name}`,
    domain: domain.domain,
    ...(sensitive ? { sensitive: true as const } : {}),
    options: {
      ...jobOptions,
      ...(sensitive ? { removeOnComplete: true, removeOnFail: true } : {}),
      ordering: { ...ordering, concurrency: getBackgroundOrderingConcurrency(ordering.key) },
    },
  }
}

/** A namespaced lane key. */
export function entityOrderingKey(domain: BackgroundDomain, entity: string): string {
  return `${domain}:${entity}`
}

function assertPositiveInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer, got ${value}`)
  }
}
