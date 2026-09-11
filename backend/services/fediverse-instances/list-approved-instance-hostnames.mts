import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type ApprovedFediverseInstanceHostname = {
  hostname: string
}

/**
 * Lists the hostnames of every `fediverse_instance` topic an admin has approved for federation
 * (`topics__fediverse_instances.integration_status = 'approved'`). Used by the IPv6-only egress
 * diagnostic (backend/entrypoints/api/verify-ipv6-egress-vpc-evidence.mts) to audit that every
 * approved instance's actor host still resolves AAAA before `POST /ap/inbox` relies on IPv6-only
 * egress to fetch it directly — see docs/requirements/content/FEDIVERSE.md.
 *
 * Excludes merged/soft-deleted topics per the canonical active-topic filter
 * (docs/requirements/content/reference-topics-topic-aliases.md#active-topic-filter).
 *
 * Unpaginated by design: the AAAA audit above needs every approved host in one pass, not a page of
 * them, and this only ever runs from the ECS one-off diagnostic, never a request path.
 */
export async function listApprovedFediverseInstanceHostnames(): Promise<
  ApprovedFediverseInstanceHostname[]
> {
  const { rows } = await read<ApprovedFediverseInstanceHostname>(sql`
    /* listApprovedFediverseInstanceHostnames */
    SELECT uh.hostname
    FROM topics__fediverse_instances tfi
    JOIN topics t ON t.id = tfi.topic_id
    JOIN url_hostnames uh ON uh.id = t.hostname_id
    WHERE tfi.integration_status = 'approved'
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
    ORDER BY uh.hostname
  `)
  return rows
}
