import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type ApprovedFediverseInstanceHostname = {
  hostname: string
}

/**
 * Lists the hostnames of every `fediverse_instance` topic an admin has approved for federation
 * (`fediverse_instance_topics.integration_status = 'approved'`). Used by the IPv6-only egress
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
  // no-mistakes-disable-next-line postgres-required-predicates: merge creates the destination fediverse_instance_topics row and removes the source subtype; approved-instance lookup still excludes deleted topics
  const { rows } = await read<ApprovedFediverseInstanceHostname>(sql`
    /* listApprovedFediverseInstanceHostnames */
    SELECT uh.hostname
    -- no-mistakes-disable-next-line postgres-bounded-statements: the one-off ECS IPv6 diagnostic (backend/entrypoints/api/verify-ipv6-egress-vpc-evidence.mts, never a request path) audits every approved federation instance, so truncation would leave the deployment evidence incomplete; the topics and url_hostnames joins are primary-key lookups from each approved instance row (no-mistakes FP jonathanong/no-mistakes#3114; remove when fixed)
    FROM fediverse_instance_topics tfi JOIN topics t ON t.id = tfi.topic_id JOIN url_hostnames uh ON uh.id = t.hostname_id
    WHERE tfi.integration_status = 'approved'
      AND t.deleted_at IS NULL
    ORDER BY uh.hostname
  `)
  return rows
}
