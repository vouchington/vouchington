import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createContentProvenanceListFixture,
  insertContentProvenanceOAuthClient,
  readConstraintDefinition,
  readContentProvenanceCatalog,
  type ContentProvenance,
} from '../../../test-helpers/data-stores/psql/content-provenance.mts'
import { createTestUser } from '../../../test-helpers/entities/users.mts'
import { onGracefulShutdown } from '../index.mts'

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
      })
      expect(row.index_definition).toContain(
        '(created_via_oauth_client_id) WHERE (created_via_oauth_client_id IS NOT NULL)',
      )
      expect(row.trigger_definition).toContain(
        'BEFORE UPDATE OF created_via, created_via_oauth_client_id',
      )
    }
  })

  it('accepts every channel without a client, and an OAuth client only on API or MCP', async () => {
    const fixture = await createContentProvenanceListFixture()
    const accepted: ContentProvenance[] = [
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

  it('keeps an OAuth client that created content', async () => {
    const fixture = await createContentProvenanceListFixture()
    await fixture.insertList({ createdVia: 'mcp', oauthClientId: fixture.oauthClientId })

    await expect(fixture.deleteOAuthClient()).rejects.toMatchObject({ code: '23001' })
  })

  it('keeps each OAuth client metadata URL a unique HTTPS URL with a path', async () => {
    const metadataUrl = `https://agent.example/${randomUUID()}/client.json`
    await expect(insertContentProvenanceOAuthClient({ metadataUrl })).resolves.toEqual(
      expect.any(String),
    )
    await expect(insertContentProvenanceOAuthClient({ metadataUrl })).rejects.toMatchObject({
      code: '23505',
    })

    for (const invalidUrl of [
      'http://agent.example/client.json',
      'https://agent.example',
      'https://user@agent.example/client.json',
      'https://agent.example/client.json#fragment',
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
    await expect(
      insertContentProvenanceOAuthClient({ verifiedAt: new Date() }),
    ).resolves.toEqual(expect.any(String))
    await expect(
      insertContentProvenanceOAuthClient({ verifiedById: staff.id }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(readConstraintDefinition('oauth_clients_verified_by_id_fkey')).resolves.toBe(
      'FOREIGN KEY (verified_by_id) REFERENCES users(id) ON DELETE SET NULL',
    )
  })
})
