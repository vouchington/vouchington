import type { JobOptions } from 'glide-mq'
import type {
  BackgroundCpuDomainDefinition,
  BackgroundCpuJobDefinition,
  BackgroundCpuJobSpec,
} from '../types.mts'

const LOCAL_NAME = /^[a-z][A-Za-z0-9_-]*$/

export function defineBackgroundCpuDomain(
  definition: BackgroundCpuDomainDefinition,
): BackgroundCpuDomainDefinition {
  assertPositiveInteger(`${definition.domain} workerConcurrency`, definition.workerConcurrency)
  if (definition.group?.kind === 'domain') {
    assertPositiveInteger(`${definition.domain} group concurrency`, definition.group.concurrency)
  }
  if (definition.group?.kind === 'lanes') {
    assertPositiveInteger(`${definition.domain} lane cap`, definition.group.cap)
  }
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
  return {
    name: `${domain.domain}.${name}`,
    domain: domain.domain,
    options: { ...jobOptions, ...(domainOrdering(domain) ?? {}) },
  }
}

/** The shared key and limits of a domain-wide group, or nothing for any other kind. */
function domainOrdering(
  domain: BackgroundCpuDomainDefinition,
): Pick<JobOptions, 'ordering'> | null {
  if (domain.group?.kind !== 'domain') return null
  const { concurrency, rateLimit } = domain.group
  return {
    ordering: { key: domain.domain, concurrency, ...(rateLimit ? { rateLimit } : {}) },
  }
}

function assertPositiveInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer, got ${value}`)
  }
}
