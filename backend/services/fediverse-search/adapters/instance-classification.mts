import onError from '@modules/on-error'
import { fetch } from 'undici'
import { getProviderRequestDispatcher } from '@modules/api-egress-proxy'
import {
  FEDIVERSE_ADAPTER_BUDGET_MS,
  FEDIVERSE_BLUESKY_HOST,
  FEDIVERSE_LEMMY_HOST,
  FEDIVERSE_MASTODON_HOST,
  FEDIVERSE_PEERTUBE_HOST,
  FEDIVERSE_PROVIDER_TIMEOUT_MS,
} from '@voucha/config'
import {
  findNodeInfoSchema2Link,
  mapNodeInfoDocument,
  type InstanceClassificationMetadata,
} from './instance-classification-mappers.mts'

export {
  type InstanceClassificationMetadata,
  type NodeInfoDocument,
  findNodeInfoSchema2Link,
  mapNodeInfoDocument,
} from './instance-classification-mappers.mts'

export type InstanceClassificationErrorCode = 'unsupported_host' | 'provider_error'

export type InstanceClassificationResult =
  | { status: 'ok'; metadata: InstanceClassificationMetadata }
  | { status: 'error'; error_code: InstanceClassificationErrorCode }

// v1 only classifies the four hosts this deployment already talks to via the search adapters
// (inbound NodeInfo reads). Classifying arbitrary/user-supplied hosts is out of scope until
// outbound NodeInfo-serving and discovery ship (Phase C) — restricting to config hosts keeps
// this an allowlisted fetch rather than an SSRF-relevant arbitrary-host fetch.
function getSupportedFediverseHosts(): ReadonlySet<string> {
  return new Set([
    FEDIVERSE_PEERTUBE_HOST,
    FEDIVERSE_MASTODON_HOST,
    FEDIVERSE_LEMMY_HOST,
    FEDIVERSE_BLUESKY_HOST,
  ])
}

/* no-mistakes: integration=nodeinfo */
async function fetchNodeInfoWellKnown(host: string, budgetSignal: AbortSignal): Promise<unknown> {
  const signal = AbortSignal.any([AbortSignal.timeout(FEDIVERSE_PROVIDER_TIMEOUT_MS), budgetSignal])
  const url = new URL(`https://${host}/.well-known/nodeinfo`)

  const response = await fetch(url, {
    dispatcher: getProviderRequestDispatcher('fediverse_search_enabled'),
    signal,
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`NodeInfo well-known lookup returned ${response.status} for host ${host}`)
  }

  return response.json()
}

/* no-mistakes: integration=nodeinfo */
async function fetchNodeInfoDocument(url: URL, budgetSignal: AbortSignal): Promise<unknown> {
  const signal = AbortSignal.any([AbortSignal.timeout(FEDIVERSE_PROVIDER_TIMEOUT_MS), budgetSignal])

  const response = await fetch(url, {
    dispatcher: getProviderRequestDispatcher('fediverse_search_enabled'),
    signal,
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`NodeInfo document fetch returned ${response.status} for URL ${url.href}`)
  }

  return response.json()
}

// The schema-2.0 link is content returned by the target host itself; requiring it to resolve
// back to that same host (rather than following it wherever it points) keeps the second fetch
// inside the allowlisted host instead of trusting an arbitrary redirect target.
function resolveSameHostSchemaLink(host: string, href: string): URL | null {
  try {
    const url = new URL(href)
    return url.hostname === host ? url : null
  } catch {
    return null
  }
}

// No caller yet — this is the classification primitive a later Phase B slice's service layer
// wires up when `topics__fediverse_instances` rows are created/refreshed.
export async function classifyFediverseInstance(
  host: string,
): Promise<InstanceClassificationResult> {
  if (!getSupportedFediverseHosts().has(host)) {
    return { status: 'error', error_code: 'unsupported_host' }
  }

  const budgetSignal = AbortSignal.timeout(FEDIVERSE_ADAPTER_BUDGET_MS)

  try {
    const wellKnown = await fetchNodeInfoWellKnown(host, budgetSignal)
    const schemaLink = findNodeInfoSchema2Link(wellKnown)
    const schemaUrl = schemaLink ? resolveSameHostSchemaLink(host, schemaLink) : null
    if (!schemaUrl) {
      return { status: 'error', error_code: 'provider_error' }
    }

    const nodeinfo = await fetchNodeInfoDocument(schemaUrl, budgetSignal)
    return { status: 'ok', metadata: mapNodeInfoDocument(nodeinfo) }
  } catch (error) {
    onError(error as Error)
    return { status: 'error', error_code: 'provider_error' }
  }
}
