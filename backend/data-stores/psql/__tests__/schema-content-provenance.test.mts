import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createContentProvenanceListFixture,
  createContentProvenancePostFixture,
  insertContentProvenanceOAuthClient,
  readContentCreationChannels,
  readConstraintDefinition,
  readContentProvenanceCatalog,
  readViewsReferencingContentProvenance,
  type ContentProvenanceColumns,
} from '../../../test-helpers/data-stores/psql/content-provenance.mts'
import { createTestUser } from '../../../test-helpers/entities/users.mts'
import { beginTransaction, onGracefulShutdown } from '../index.mts'

const CONTENT_TABLES = [
  'communities',
  'community_applications',
  'lists',
  'moderation_appeals',
  'moderation_reports',
  'posts',
  'rss_feeds',
  'topics',
  'user_referral_program_links',
]

describe('content provenance schema', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('records validated, immutable provenance on every user-content table', async () => {
    const catalog = await readContentProvenanceCatalog(CONTENT_TABLES)

    expect(catalog.map(row => row.table_name)).toEqual(CONTENT_TABLES)
    for (const row of catalog) {
      expect(row).toMatchObject({
        created_via_type: 'content_creation_channels',
        oauth_client_id_type: 'uuid',
        foreign_key:
          'FOREIGN KEY (created_via_oauth_client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT',
        check_constraint:
          "CHECK (((created_via_oauth_client_id IS NULL) OR ((created_via IS NOT NULL) AND (created_via = ANY (ARRAY['api'::content_creation_channels, 'mcp'::content_creation_channels])))))",
        constraints_validated: true,
        index_valid: true,
      })
      expect(row.index_definition).toContain(
        '(created_via_oauth_client_id) WHERE (created_via_oauth_client_id IS NOT NULL)',
      )
      expect(row.trigger_definition).toContain(
        'FOR EACH ROW WHEN (((old.created_via IS DISTINCT FROM new.created_via) OR (old.created_via_oauth_client_id IS DISTINCT FROM new.created_via_oauth_client_id)))',
      )
      expect(row.trigger_definition).toContain(`AFTER UPDATE ON public.${row.table_name} `)
    }
    await expect(readContentCreationChannels()).resolves.toEqual([
      'web',
      'swift',
      'dotnet',
      'api',
      'mcp',
      'system',
    ])
  })

  it('accepts every channel without a client, and an OAuth client only on API or MCP', async () => {
    const fixture = await createContentProvenanceListFixture()
    const accepted: ContentProvenanceColumns[] = [
      { createdVia: null, oauthClientId: null },
      { createdVia: 'web', oauthClientId: null },
      { createdVia: 'swift', oauthClientId: null },
      { createdVia: 'dotnet', oauthClientId: null },
      { createdVia: 'api', oauthClientId: null },
      { createdVia: 'mcp', oauthClientId: null },
      { createdVia: 'system', oauthClientId: null },
      { createdVia: 'api', oauthClientId: fixture.oauthClientId },
      { createdVia: 'mcp', oauthClientId: fixture.oauthClientId },
    ]
    for (const provenance of accepted) {
      await expect(fixture.insertList(provenance)).resolves.toEqual(expect.any(String))
    }

    for (const createdVia of [null, 'web', 'swift', 'dotnet', 'system'] as const) {
      await expect(
        fixture.insertList({ createdVia, oauthClientId: fixture.oauthClientId }),
      ).rejects.toMatchObject({ code: '23514' })
    }
    await expect(
      fixture.insertList({ createdVia: 'mcp', oauthClientId: randomUUID() }),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('keeps provenance immutable, including on rows that predate tracking', async () => {
    const fixture = await createContentProvenanceListFixture()
    const agentListId = await fixture.insertList({
      createdVia: 'mcp',
      oauthClientId: fixture.oauthClientId,
    })
    const untrackedListId = await fixture.insertList({ createdVia: null, oauthClientId: null })

    await expect(
      fixture.updateProvenance(agentListId, {
        createdVia: 'api',
        oauthClientId: fixture.oauthClientId,
      }),
    ).rejects.toThrow('content provenance is immutable')
    await expect(
      fixture.updateProvenance(agentListId, { createdVia: 'mcp', oauthClientId: null }),
    ).rejects.toThrow('content provenance is immutable')
    await expect(
      fixture.updateProvenance(untrackedListId, { createdVia: 'web', oauthClientId: null }),
    ).rejects.toThrow('content provenance is immutable')
    await expect(fixture.keepProvenance(agentListId)).resolves.toMatchObject({ rowCount: 1 })
    await expect(fixture.renameList(agentListId)).resolves.toMatchObject({ rowCount: 1 })
  })

  it('enforces provenance on rows of the partitioned posts table', async () => {
    const { oauthClientId } = await createContentProvenanceListFixture()
    const post = await createContentProvenancePostFixture()

    await expect(post.updateProvenance({ createdVia: null, oauthClientId })).rejects.toMatchObject({
      code: '23514',
    })
    await expect(
      post.updateProvenance({ createdVia: 'mcp', oauthClientId: randomUUID() }),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(post.updateProvenance({ createdVia: 'web', oauthClientId: null })).rejects.toThrow(
      'content provenance is immutable',
    )
    await expect(
      post.updateProvenance({ createdVia: 'system', oauthClientId: null }),
    ).resolves.toMatchObject({ rowCount: 1 })
  })

  it('keeps provenance out of every view until a reviewed label exposes it', async () => {
    await expect(readViewsReferencingContentProvenance()).resolves.toEqual([])

    await using transaction = await beginTransaction()
    const probeView = `content_provenance_probe_${randomUUID().replaceAll('-', '')}`
    await transaction(`/* createContentProvenanceProbeView */
      CREATE VIEW ${probeView} AS SELECT id, created_via FROM lists`)
    await expect(readViewsReferencingContentProvenance({ query: transaction })).resolves.toEqual([
      probeView,
    ])
  })

  it('keeps an OAuth client that created content', async () => {
    const fixture = await createContentProvenanceListFixture()
    await fixture.insertList({ createdVia: 'mcp', oauthClientId: fixture.oauthClientId })

    await expect(fixture.deleteOAuthClient()).rejects.toMatchObject({ code: '23001' })
  })

  it('keeps each OAuth client metadata URL a unique, canonical HTTPS URL with a path', async () => {
    const metadataUrl = `https://agent.example/${randomUUID()}/client.json`
    await expect(insertContentProvenanceOAuthClient({ metadataUrl })).resolves.toEqual(
      expect.any(String),
    )
    await expect(
      insertContentProvenanceOAuthClient({
        metadataUrl: `https://agent.example:8443/${randomUUID()}.json?v=1`,
      }),
    ).resolves.toEqual(expect.any(String))
    await expect(insertContentProvenanceOAuthClient({ metadataUrl })).rejects.toMatchObject({
      code: '23505',
    })

    for (const invalidUrl of [
      'http://agent.example/client.json',
      'https://agent.example',
      'https://user@agent.example/client.json',
      'https://agent.example/client.json#fragment',
      'https://Agent.example/client.json',
      'https://agent.example/client file.json',
      'https://agent.example/client\tfile.json',
      'https://agent.example/../client.json',
      'https://agent.example/clients/./client.json',
      'https://agent.example/clients/..',
      'https://agent.example/clients/.?v=1',
      `https://agent.example/${'a'.repeat(2048)}`,
    ]) {
      await expect(
        insertContentProvenanceOAuthClient({ metadataUrl: invalidUrl }),
      ).rejects.toMatchObject({ code: '23514' })
    }
  })

  it('records who verified an OAuth client only alongside when', async () => {
    const staff = await createTestUser()

    await expect(
      insertContentProvenanceOAuthClient({ verifiedAt: new Date(), verifiedById: staff.id }),
    ).resolves.toEqual(expect.any(String))
    await expect(insertContentProvenanceOAuthClient({ verifiedAt: new Date() })).resolves.toEqual(
      expect.any(String),
    )
    await expect(
      insertContentProvenanceOAuthClient({ verifiedById: staff.id }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(readConstraintDefinition('oauth_clients_verified_by_id_fkey')).resolves.toBe(
      'FOREIGN KEY (verified_by_id) REFERENCES users(id) ON DELETE SET NULL',
    )
  })
})
