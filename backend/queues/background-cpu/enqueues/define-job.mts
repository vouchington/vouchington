import type {
  BackgroundCpuDomainDefinition,
  BackgroundCpuJobDefinition,
  BackgroundCpuJobSpec,
} from '../types.mts'
import { getBackgroundCpuOrderingConcurrency } from '../config.mts'

const LOCAL_NAME = /^[a-z][A-Za-z0-9_-]*$/

export function defineBackgroundCpuDomain(
  definition: BackgroundCpuDomainDefinition,
): BackgroundCpuDomainDefinition {
  assertPositiveInteger(`${definition.domain} workerConcurrency`, definition.workerConcurrency)
  return definition
}

export function defineBackgroundCpuJob<TData = unknown>(
  domain: BackgroundCpuDomainDefinition,
  spec: BackgroundCpuJobSpec,
): BackgroundCpuJobDefinition<TData> {
  if (!LOCAL_NAME.test(spec.name)) {
    throw new TypeError(`Background CPU job name "${spec.name}" must not contain a domain or dot`)
  }
  if (!Number.isInteger(spec.priority) || spec.priority < 1 || spec.priority > 2048) {
    throw new RangeError(`Background CPU job ${domain.domain}.${spec.name} needs priority 1..2048`)
  }
  for (const [label, value] of [
    ['attempts', spec.attempts],
    ['lockDuration', spec.lockDuration],
    ['timeout', spec.timeout],
  ] as const) {
    if (value !== undefined) assertPositiveInteger(`${spec.name} ${label}`, value)
  }
  const { name, ...jobOptions } = spec
  const ordering = spec.ordering ?? {
    key: domain.domain,
    ...(domain.rateLimit ? { rateLimit: domain.rateLimit } : {}),
  }
  return {
    name: `${domain.domain}.${name}`,
    domain: domain.domain,
    options: {
      ...jobOptions,
      ordering: { ...ordering, concurrency: getBackgroundCpuOrderingConcurrency(ordering.key) },
    },
  }
}

function assertPositiveInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer, got ${value}`)
  }
}
