import { beginTransaction, isUniqueViolation, write } from '@data-stores/psql'
import type { BasicUser } from '@services/users/types'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { createSlugFromTitle } from '@modules/utils'
import { createTopicEmbeddingContent } from '@services/topics/content'
import { linkHostnameToSourceTopic } from '@services/topics/hostname-link'
import { createTopicRevision, computeTopicChanges } from '@services/topic-revisions'
import { getTopicByAny } from '@services/topics/get'
import { finalizeCreatedTopic } from '@services/topics/create'
import { finalizeClaimedTopicAliases } from '@services/topics/aliases'
import * as topicAliasClaim from '@services/topics/claim-and-sync-alias'
import type { TopicAlias } from '@services/topics/alias-types'
import { findExistingInstanceByHostnameId } from './find-existing-instance.mts'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { randomBytes } from 'node:crypto'
import type { InstanceClassificationMetadata } from '@services/fediverse-search/adapters/instance-classification'

export type GeneratedInstanceDetails = { name: string; slug: string }

/**
 * name = hostname (attempt 0); slug = slugify(hostname), capped at 250 chars.
 *
 * On retry, BOTH name and slug get the same random hex suffix appended. topics.name
 * (idx_topics__name) and topics.slug (idx_topics__slug) are both global, non-partial unique
 * indexes — unlike idx_topics__fediverse_instance__hostname_id, they are NOT scoped to active
 * topics. So a merged/soft-deleted instance topic for this hostname permanently occupies its
 * name and slug even though findExistingInstanceByHostnameId (correctly, per the active-only
 * dedup design) no longer sees it as blocking. Varying only the slug on retry (RSS's pattern)
 * is not enough here: RSS never hits this case because its dedup lookup spans all topic
 * lifecycle states, so it never retries against a name it still can't reuse.
 *
 * Dots are replaced with spaces before slugifying — createSlugFromTitle's strict mode drops
 * `.` entirely rather than hyphenating it, which would otherwise collapse "example.com" into
 * the unreadable "examplecom" instead of "example-com".
 */
export function generateInstanceDetails(
  hostname: string,
  attempt: number,
): GeneratedInstanceDetails {
  const baseSlug = createSlugFromTitle(hostname.replace(/\./g, ' '), 250)
  if (attempt === 0) return { name: hostname, slug: baseSlug }
  const suffix = randomBytes(2).toString('hex')
  return { name: `${hostname} (${suffix})`, slug: `${baseSlug}-${suffix}` }
}

export type CreateInstanceTransactionResult = { topicId: string; claimedAlias: TopicAlias }

/**
 * Creates a topic (type=fediverse_instance) + its extension row in a transaction.
 * Returns null on unique violation (slug collision or a concurrent hostname race).
 *
 * createdById is always a real user — unlike RSS's admin/kagi-seeded null-creator path, every
 * fediverse instance topic created by this service is suggested by an authenticated user, so
 * the topic revision is created unconditionally.
 */
export async function createInstanceInTransaction(
  provenance: ContentProvenance,
  createdById: string,
  hostnameId: string,
  name: string,
  slug: string,
  metadata: InstanceClassificationMetadata | null,
): Promise<CreateInstanceTransactionResult | null> {
  try {
    await using query = await beginTransaction()
    const options = { query }
    const { content_sha256 } = createTopicEmbeddingContent({ name })

    const { rows: topicRows } = await write(
      sql`/* createInstanceInTransaction:topic */
        INSERT INTO topics (
          name, slug, topic_type, created_by_id, bedrock_nova_multimodal_v1_content_sha256,
          created_via, created_via_oauth_client_id
        )
        VALUES (
          ${name}, ${slug}, 'fediverse_instance', ${createdById}, ${content_sha256},
          ${provenance.createdVia}, ${provenance.oauthClientId}
        )
        RETURNING id
      `,
      options,
    )
    const topicId = topicRows[0].id as string
    const [claimedAlias] = await Promise.all([
      topicAliasClaim.claimTopicAliasAndSync(topicId, slug, options),
      linkHostnameToSourceTopic(topicId, hostnameId, options),
    ])

    await write(
      sql`/* createInstanceInTransaction:extension */
        INSERT INTO topics__fediverse_instances (
          topic_id,
          software,
          protocol,
          nodeinfo_software_version,
          total_users,
          monthly_active_users,
          open_registrations,
          nodeinfo_raw
        )
        VALUES (
          ${topicId},
          ${metadata?.software ?? null},
          ${metadata?.protocol ?? null},
          ${metadata?.nodeinfo_software_version ?? null},
          ${metadata?.total_users ?? null},
          ${metadata?.monthly_active_users ?? null},
          ${metadata?.open_registrations ?? null},
          ${metadata?.nodeinfo_raw ? JSON.stringify(metadata.nodeinfo_raw) : null}::jsonb
        )
      `,
      options,
    )

    const topic = (await getTopicByAny(topicId, options))!
    const changes = computeTopicChanges(null, topic)
    await createTopicRevision(topicId, 'create', changes, createdById, options)

    const result = { topicId, claimedAlias }

    await query.commit()
    return result
  } catch (error) {
    if (isUniqueViolation(error) || topicAliasClaim.isTopicAliasOwnershipConflict(error))
      return null
    throw error
  }
}

export type CreateFediverseInstanceArgs = {
  provenance: ContentProvenance
  hostnameId: string
  name: string
  slug: string
  createdById: string
  metadata: InstanceClassificationMetadata | null
}

/** Shared wrapper: inserts topic+extension row, then finalizes topic creation (bloom filter, listeners). */
export async function createFediverseInstance(
  args: CreateFediverseInstanceArgs,
): Promise<(CreateInstanceTransactionResult & { slug: string; name: string }) | null> {
  const result = await createInstanceInTransaction(
    args.provenance,
    args.createdById,
    args.hostnameId,
    args.name,
    args.slug,
    args.metadata,
  )
  if (!result) return null
  await finalizeClaimedTopicAliases(result.topicId, [result.claimedAlias])
  const topic = (await getTopicByAny(result.topicId))!
  finalizeCreatedTopic(topic, {
    name: args.name,
    slug: args.slug,
    topic_type: 'fediverse_instance',
  })
  return { ...result, slug: args.slug, name: args.name }
}

export type CreateInstanceWithRetryArgs = {
  provenance: ContentProvenance
  currentUser: BasicUser
  hostnameId: string
  hostname: string
  attempt: number
  metadata: InstanceClassificationMetadata | null
}

/** Creates an instance topic with name/slug-collision retry; returns null when a hostname race condition is detected. */
export async function createInstanceWithRetry(
  args: CreateInstanceWithRetryArgs,
): Promise<(CreateInstanceTransactionResult & { slug: string; name: string }) | null> {
  const { provenance, currentUser, hostnameId, hostname, attempt, metadata } = args
  const { name, slug } = generateInstanceDetails(hostname, attempt)
  const result = await createFediverseInstance({
    provenance,
    hostnameId,
    name,
    slug,
    createdById: currentUser.id,
    metadata,
  })
  if (result) return result

  // After any unique violation, check if it was a hostname race condition first.
  const raceExisting = await findExistingInstanceByHostnameId(hostnameId)
  if (raceExisting) return null

  assert(attempt < 2, 409, 'An instance topic with this hostname already exists')
  return createInstanceWithRetry({ ...args, attempt: attempt + 1 })
}
