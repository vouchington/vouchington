import type {
  FediverseInstanceAttributes,
  FediverseInstanceResponse,
  FediverseInstancesResponse,
} from '@/types/fediverse-instances'
import type { TopicsResponseBody } from '@/types/api-responses'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {}
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export function normalizeFediverseInstanceAttributes(
  value: unknown,
): FediverseInstanceAttributes | null {
  if (value === null || value === undefined) return null
  const source = record(value)
  return {
    software: nullableString(source.software),
    protocol: nullableString(source.protocol),
    nodeinfo_software_version: nullableString(source.nodeinfo_software_version),
    total_users: nullableNumber(source.total_users),
    monthly_active_users: nullableNumber(source.monthly_active_users),
    open_registrations: nullableBoolean(source.open_registrations),
  }
}

export function isCurrentFediverseInstancesResponse(value: unknown): boolean {
  const source = record(value)
  return [
    'topics_metrics',
    'fediverse_instances',
    'hostname_elections',
    'markdown_to_html',
    'bookmarks',
    'election_votes',
  ].every(key => isRecord(source[key]))
}

export function normalizeFediverseInstancesResponse(value: unknown): FediverseInstancesResponse {
  const source = record(value)
  const rawInstances = record(source.fediverse_instances)
  const fediverseInstances = Object.fromEntries(
    Object.entries(rawInstances).flatMap(([id, attributes]) => {
      const normalized = normalizeFediverseInstanceAttributes(attributes)
      return normalized ? [[id, normalized]] : []
    }),
  )

  return {
    results: (Array.isArray(source.results) ? source.results : []) as TopicsResponseBody['results'],
    page_info: record(source.page_info) as FediverseInstancesResponse['page_info'],
    topics: record(source.topics) as FediverseInstancesResponse['topics'],
    topics_metrics: record(source.topics_metrics) as FediverseInstancesResponse['topics_metrics'],
    fediverse_instances: fediverseInstances,
    hostname_elections: record(
      source.hostname_elections,
    ) as FediverseInstancesResponse['hostname_elections'],
    topic_elections: record(
      source.topic_elections,
    ) as FediverseInstancesResponse['topic_elections'],
    markdown_to_html: record(
      source.markdown_to_html,
    ) as FediverseInstancesResponse['markdown_to_html'],
    bookmarks: record(source.bookmarks) as FediverseInstancesResponse['bookmarks'],
    election_votes: record(source.election_votes) as FediverseInstancesResponse['election_votes'],
  }
}

export function normalizeFediverseInstanceResponse(value: unknown): FediverseInstanceResponse {
  const source = record(value)
  return {
    topic: source.topic as FediverseInstanceResponse['topic'],
    fediverse_instance: normalizeFediverseInstanceAttributes(source.fediverse_instance),
    topic_election: (source.topic_election ?? null) as FediverseInstanceResponse['topic_election'],
    hostname_election: (source.hostname_election ??
      null) as FediverseInstanceResponse['hostname_election'],
  }
}
