import type { JobOptions } from 'glide-mq'
import type { BackgroundDomain } from '../config.mts'
import type {
  BackgroundDomainDefinition,
  BackgroundJobDefinition,
  BackgroundJobSpec,
} from '../types.mts'

const LOCAL_NAME = /^[a-z][A-Za-z0-9_-]*$/

export function defineBackgroundDomain(
  definition: BackgroundDomainDefinition,
): BackgroundDomainDefinition {
  assertPositiveInteger(`${definition.domain} workerConcurrency`, definition.workerConcurrency)
  if (definition.group.kind === 'domain') {
    assertPositiveInteger(`${definition.domain} group concurrency`, definition.group.concurrency)
  }
  if (definition.group.kind === 'lanes') {
    assertPositiveInteger(`${definition.domain} lane cap`, definition.group.cap)
  }
  return definition
}

export function defineBackgroundJob<TData = unknown>(
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
  const { name, ...jobOptions } = spec
  return {
    name: `${domain.domain}.${name}`,
    domain: domain.domain,
    options: { ...jobOptions, ...(domainOrdering(domain) ?? {}) },
  }
}

/** The shared key and limits of a domain-wide group, or nothing for any other kind. */
function domainOrdering(domain: BackgroundDomainDefinition): Pick<JobOptions, 'ordering'> | null {
  if (domain.group.kind !== 'domain') return null
  const { concurrency, rateLimit } = domain.group
  return {
    ordering: { key: domain.domain, concurrency, ...(rateLimit ? { rateLimit } : {}) },
  }
}

/** A namespaced singleton-lane key: for a `lanes` domain, or beside a `domain` group. */
export function entityOrderingKey(domain: BackgroundDomain, entity: string): string {
  return `${domain}:${entity}`
}

function assertPositiveInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer, got ${value}`)
  }
}
