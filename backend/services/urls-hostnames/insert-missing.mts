import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'

type InsertedHostname = { id: string; hostname: string; is_blocked: boolean }

/** A conflicting insert waits for its winner, then leaves that row unlocked. */
export async function insertMissingUrlHostnames(
  hostnames: string[],
  userId: string | null,
  publiclyIntroduced: boolean,
  options: QueryOptions,
): Promise<InsertedHostname[]> {
  const { rows } = await write<InsertedHostname>(
    `/* upsertUrlHostnames:insertMissing */
    WITH input(hostname) AS (
      SELECT unnest($1::text[])
    ),
    parent_policy AS (
      SELECT
        hostname,
        is_blocked,
        REPLACE(REPLACE(REPLACE(hostname, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') AS hostname_like
      FROM url_hostnames host
      WHERE host.is_blocked
        AND EXISTS (
          SELECT 1 FROM url_hostname_blocks parent_block
          WHERE parent_block.url_hostname_id = host.id
            AND parent_block.lifted_at IS NULL
            AND parent_block.domain_blocklist_source_id IS NULL
        )
    ),
    inherited AS (
      SELECT
        input.hostname,
        EXISTS (
          SELECT 1
          FROM parent_policy parent
          WHERE parent.is_blocked
            AND (
              input.hostname = parent.hostname
              OR input.hostname LIKE '%.' || parent.hostname_like ESCAPE '\\'
            )
        ) AS is_blocked,
        FALSE AS should_skip_web_risk
      FROM input
    )
    INSERT INTO url_hostnames (hostname, created_by_id, is_crawlable, is_blocked, should_skip_web_risk, publicly_introduced_at)
    SELECT
      hostname,
      $2,
      true,
      CASE WHEN $3::boolean THEN FALSE ELSE is_blocked END,
      should_skip_web_risk,
      CASE WHEN $3::boolean THEN CURRENT_TIMESTAMP ELSE NULL END
    FROM inherited
    ORDER BY hostname
    ON CONFLICT (hostname) DO NOTHING
    RETURNING id, hostname, is_blocked
  `,
    [hostnames, userId, publiclyIntroduced],
    options,
  )
  return rows
}

/** Read parent policy after ownership locks, so a waited-out block is visible. */
export async function getNewPublicHostnamesInheritedBlockedIds(
  hostnameIds: string[],
  options: QueryOptions,
): Promise<string[]> {
  if (hostnameIds.length === 0) return []
  const { rows } = await read<{ id: string }>(
    `/* upsertUrlHostnames:publicInheritedBlocks */
    SELECT child.id
    FROM url_hostnames child
    WHERE child.id = ANY($1::uuid[])
      AND EXISTS (
        SELECT 1
        FROM url_hostnames parent
        JOIN url_hostname_blocks parent_block ON parent_block.url_hostname_id = parent.id
        WHERE parent.is_blocked
          AND parent_block.lifted_at IS NULL
          AND parent_block.domain_blocklist_source_id IS NULL
          AND (
            child.hostname = parent.hostname
            OR child.hostname LIKE '%.' || REPLACE(REPLACE(REPLACE(parent.hostname, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') ESCAPE '\\'
          )
      )`,
    [hostnameIds],
    options,
  )
  return rows.map(row => row.id)
}
