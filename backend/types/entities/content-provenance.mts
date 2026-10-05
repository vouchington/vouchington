// Mirrors the `content_creation_channels` Postgres enum. See
// docs/requirements/content/content-provenance.md.
export const contentCreationChannels = ['web', 'swift', 'dotnet', 'api', 'mcp', 'system'] as const

export type ContentCreationChannel = (typeof contentCreationChannels)[number]

// Only credential-grade agent channels may name an OAuth client, matching each table's
// `<table>_created_via_oauth_client_id_check`.
export type OAuthContentCreationChannel = Extract<ContentCreationChannel, 'api' | 'mcp'>

export type ContentProvenance =
  | {
      createdVia: Exclude<ContentCreationChannel, OAuthContentCreationChannel>
      oauthClientId: null
    }
  | { createdVia: OAuthContentCreationChannel; oauthClientId: string | null }

// Queue jobs, seeds, scripts and content the platform authors itself.
export const SYSTEM_PROVENANCE: ContentProvenance = Object.freeze({
  createdVia: 'system',
  oauthClientId: null,
})

// The app a public response names for an API or MCP created row. Facts only, never copy: each
// client composes its own wording, and the only names the server sends are the hostname and the
// staff-verified registered name.
export type PublicProvenanceApp =
  // A client on the reviewed allowlist. `key` is a lowercase slug whose display copy lives in each
  // client's localization catalog.
  | { kind: 'known'; key: string }
  // Any other Client ID Metadata Document client: the hostname of its `metadata_url`.
  | { kind: 'hostname'; hostname: string }
  // A dynamically registered client that staff verified. The registered name is data about the
  // app, and staff verification is what makes it safe to show.
  | { kind: 'verified'; client_id: string; client_name: string }

// What a public response may say about an API or MCP created row. `app` is null for a plain
// "via API" / "via MCP". Web, native and system rows never carry one.
export type PublicContentProvenance = {
  via: OAuthContentCreationChannel
  app: PublicProvenanceApp | null
}

// The raw record moderation staff see. `oauth_client` is absent when the author is hidden from
// the viewer (anonymous content), and null when no OAuth client created the row.
export type StaffContentProvenance = {
  created_via: ContentCreationChannel
  oauth_client?: {
    client_id: string
    client_name: string
    metadata_url: string | null
    verified: boolean
  } | null
}
