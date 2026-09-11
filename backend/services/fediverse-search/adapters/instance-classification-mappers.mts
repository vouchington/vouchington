export type NodeInfoWellKnownLink = {
  rel?: string
  href?: string
}

export type NodeInfoWellKnownDocument = {
  links?: NodeInfoWellKnownLink[]
}

export type NodeInfoUsageStats = {
  users?: {
    total?: number
    activeMonth?: number
  }
}

export type NodeInfoDocument = {
  version?: string
  software?: {
    name?: string
    version?: string
  }
  protocols?: string[]
  openRegistrations?: boolean
  usage?: NodeInfoUsageStats
}

export type InstanceClassificationMetadata = {
  software: string | null
  protocol: string | null
  nodeinfo_software_version: string | null
  total_users: number | null
  monthly_active_users: number | null
  open_registrations: boolean | null
  nodeinfo_raw: NodeInfoDocument | null
}

export const NODEINFO_SCHEMA_2_0_REL = 'http://nodeinfo.diaspora.software/ns/schema/2.0'

// The well-known JRD document can advertise several NodeInfo schema versions; only the 2.0
// link is a contract this classifier has verified against, so a missing/malformed `links`
// array or no matching entry is treated as "no link" rather than guessed at.
export function findNodeInfoSchema2Link(document: unknown): string | null {
  if (typeof document !== 'object' || document === null) return null
  const { links } = document as NodeInfoWellKnownDocument
  if (!Array.isArray(links)) return null

  const match = links.find(
    link =>
      typeof link === 'object' &&
      link !== null &&
      link.rel === NODEINFO_SCHEMA_2_0_REL &&
      typeof link.href === 'string' &&
      link.href.length > 0,
  )
  return match?.href ?? null
}

function readFiniteInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null
}

// Pure JSON -> metadata mapping. NodeInfo is third-party data with no shared schema
// enforcement, so every field degrades independently to null instead of throwing on a
// partial/malformed document.
export function mapNodeInfoDocument(document: unknown): InstanceClassificationMetadata {
  const isObject = typeof document === 'object' && document !== null
  const nodeinfo = isObject ? (document as NodeInfoDocument) : undefined

  const software = typeof nodeinfo?.software?.name === 'string' ? nodeinfo.software.name : null
  const nodeinfo_software_version =
    typeof nodeinfo?.software?.version === 'string' ? nodeinfo.software.version : null
  const protocol =
    Array.isArray(nodeinfo?.protocols) && typeof nodeinfo.protocols[0] === 'string'
      ? nodeinfo.protocols[0]
      : null
  const total_users = readFiniteInteger(nodeinfo?.usage?.users?.total)
  const monthly_active_users = readFiniteInteger(nodeinfo?.usage?.users?.activeMonth)
  const open_registrations =
    typeof nodeinfo?.openRegistrations === 'boolean' ? nodeinfo.openRegistrations : null

  return {
    software,
    protocol,
    nodeinfo_software_version,
    total_users,
    monthly_active_users,
    open_registrations,
    nodeinfo_raw: isObject ? (document as NodeInfoDocument) : null,
  }
}
