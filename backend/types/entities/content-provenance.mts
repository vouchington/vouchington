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
