import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { resolveEmailDomainHostnameId } from '@services/email-address-validator/email-domain-context'
import sql from 'sql-template-strings'

const BACKGROUND_OWNERS = 400
export const ACCOUNT_HISTORY = 220
export const GRANTS_PER_APP = 3
// USER_EMAIL_ADDRESSES_MAX in backend/services/user-product-limits/config.mts.
export const EMAIL_STORAGE_CAP = 25

export async function seedAccountListFixture() {
  await using transaction = await beginTransaction()
  const tag = `explain-account-${randomUUID().slice(0, 8)}`
  const hostnameId = await resolveEmailDomainHostnameId('explain-account@example.com', {
    query: transaction,
  })
  if (!hostnameId) throw new Error('Missing account scenario email hostname')
  const { rows: users } = await transaction<{ id: string; username: string }>(sql`
    /* seedAccountListUsers */
    INSERT INTO users (username)
    SELECT ${tag} || '-' || n FROM generate_series(0, ${BACKGROUND_OWNERS}) n
    RETURNING id, username`)
  const owner = users.find(user => user.username === `${tag}-0`)
  if (!owner) throw new Error('Missing account scenario owner')
  const userIds = users.map(user => user.id)
  const { rows: emailRows } = await transaction<{
    id: string
    user_id: string
    is_primary: boolean
  }>(sql`
    /* seedAccountListEmails */
    INSERT INTO user_email_addresses (user_id, email_address, email_domain_hostname_id, is_primary)
    SELECT user_id, ${tag} || '-' || user_id || '-' || n || '@example.com', ${hostnameId}, n = 1
    FROM unnest(${userIds}::uuid[]) AS owners(user_id)
    CROSS JOIN generate_series(1, CASE WHEN user_id = ${owner.id} THEN ${EMAIL_STORAGE_CAP}
      ELSE 3 END) n
    RETURNING id, user_id, is_primary`)
  const { rows: keys } = await transaction<{
    id: string
    user_id: string
    revoked_at: Date | null
  }>(sql`
    /* seedAccountListApiKeys */
    INSERT INTO api_keys (user_id, prefix, key_hash, revoked_at, expires_at)
    SELECT user_id, 'seed-key', sha256((${tag} || user_id || ':' || n)::bytea),
      CASE WHEN n % 6 = 0 THEN CURRENT_TIMESTAMP END,
      CASE WHEN n % 5 = 0 THEN CURRENT_TIMESTAMP - interval '1 day' END
    FROM unnest(${userIds}::uuid[]) AS owners(user_id)
    CROSS JOIN generate_series(1, CASE WHEN user_id = ${owner.id} THEN ${ACCOUNT_HISTORY}
      ELSE 10 END) n
    RETURNING id, user_id, revoked_at`)
  const { rows: clients } = await transaction<{
    id: string
    owner_user_id: string
    revoked_at: Date | null
  }>(sql`
    /* seedAccountListOAuthClients */
    INSERT INTO oauth_clients (client_id, owner_user_id, client_name, client_type,
      token_endpoint_auth_method, redirect_uris, grant_types, response_types, scopes, revoked_at)
    SELECT 'voucha_' || encode(sha256((${tag} || user_id || ':' || n)::bytea), 'hex'),
      user_id, 'Example account app ' || n, 'public', 'none',
      ARRAY['https://example.com/callback'],
      ARRAY['authorization_code', 'refresh_token']::oauth_grant_types[],
      ARRAY['code']::oauth_response_types[], ARRAY['topics:read']::api_scopes[],
      CASE WHEN n % 8 = 0 THEN CURRENT_TIMESTAMP END
    FROM unnest(${userIds}::uuid[]) AS owners(user_id)
    CROSS JOIN generate_series(1, CASE WHEN user_id = ${owner.id} THEN ${ACCOUNT_HISTORY}
      ELSE 8 END) n
    RETURNING id, owner_user_id, revoked_at`)
  const activeClients = new Set(
    clients.filter(client => client.revoked_at === null).map(client => client.id),
  )
  const { rows: grants } = await transaction<{
    id: string
    user_id: string
    client_id: string
    revoked_at: Date | null
  }>(sql`
    /* seedAccountListOAuthGrants */
    INSERT INTO oauth_grants (user_id, client_id, resource, scopes, revoked_at)
    SELECT client.owner_user_id, client.id, 'https://example.com/api/' || n,
      ARRAY['topics:read']::api_scopes[], CASE WHEN n = 3 THEN CURRENT_TIMESTAMP END
    FROM oauth_clients client
    CROSS JOIN generate_series(1, ${GRANTS_PER_APP}) n
    WHERE client.id = ANY(${clients.map(client => client.id)}::uuid[])
    RETURNING id, user_id, client_id, revoked_at`)
  await transaction(sql`
    /* seedAccountListOAuthTokenUse */
    INSERT INTO oauth_access_tokens (grant_id, token_hash, resource, scopes, expires_at, last_used_at)
    SELECT oauth_grant.id, encode(sha256((oauth_grant.id || ':' || n)::bytea), 'hex'),
      oauth_grant.resource, oauth_grant.scopes, CURRENT_TIMESTAMP + interval '1 day',
      CASE WHEN n > 1 THEN CURRENT_TIMESTAMP - n * interval '1 minute' END
    FROM oauth_grants oauth_grant
    CROSS JOIN generate_series(1, 3) n
    WHERE oauth_grant.id = ANY(${grants.map(grant => grant.id)}::uuid[])`)
  await transaction.commit()
  return {
    ownerId: owner.id,
    userIds,
    clientIds: clients.map(client => client.id),
    keyIds: keys.map(key => key.id),
    grantIds: grants.map(grant => grant.id),
    emailIds: emailRows
      .filter(row => row.user_id === owner.id)
      .toSorted(
        (left, right) =>
          Number(right.is_primary) - Number(left.is_primary) || left.id.localeCompare(right.id),
      )
      .map(row => row.id),
    activeKeyIds: keys
      .filter(key => key.user_id === owner.id && key.revoked_at === null)
      .map(key => key.id)
      .toSorted((left, right) => right.localeCompare(left)),
    activeClientIds: clients
      .filter(client => client.owner_user_id === owner.id && activeClients.has(client.id))
      .map(client => client.id)
      .toSorted((left, right) => right.localeCompare(left)),
    activeGrantIds: grants
      .filter(
        grant =>
          grant.user_id === owner.id &&
          grant.revoked_at === null &&
          activeClients.has(grant.client_id),
      )
      .map(grant => grant.id)
      .toSorted((left, right) => right.localeCompare(left)),
  }
}

export async function deleteAccountListFixture(
  fixture: Awaited<ReturnType<typeof seedAccountListFixture>>,
) {
  await using transaction = await beginTransaction()
  await transaction(sql`/* deleteAccountListClients */ DELETE FROM oauth_clients
    WHERE id = ANY(${fixture.clientIds}::uuid[])`)
  await transaction(sql`/* deleteAccountListUsers */ DELETE FROM users
    WHERE id = ANY(${fixture.userIds}::uuid[])`)
  await transaction(sql`/* deleteAccountListGrantAnchors */ DELETE FROM oauth_grant_retention_anchors
    WHERE id = ANY(${fixture.grantIds}::uuid[])`)
  await transaction(sql`/* deleteAccountListKeyIdentities */ DELETE FROM retained_api_key_identities
    WHERE id = ANY(${fixture.keyIds}::uuid[])`)
  await transaction(sql`/* deleteAccountListUserIdentities */ DELETE FROM retained_user_identities
    WHERE id = ANY(${fixture.userIds}::uuid[])`)
  await transaction.commit()
  await write(`/* analyzeAccountListRelations */ VACUUM (ANALYZE)
    user_email_addresses, api_keys, oauth_clients, oauth_grants, oauth_access_tokens`)
}
