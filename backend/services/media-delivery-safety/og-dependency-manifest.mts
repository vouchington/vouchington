import { beginTransaction, write } from '@data-stores/psql'
import type { QueryExecutor, TransactionQuery } from '@data-stores/psql/types'
import { isPlacementSourcePolicy, type PlacementSourcePolicy } from '@ts-shared/url-signing'
import sql from 'sql-template-strings'
import { imageDeliveryAuthorityProof } from './delivery-authority.mts'

type ManifestQueryOptions = { query?: QueryExecutor | TransactionQuery }

/** Persists the exact placement tuples an OG card is allowed to embed. */
export async function registerOgDependencyManifest(
  dependencies: readonly PlacementSourcePolicy[],
  options: ManifestQueryOptions = {},
): Promise<string> {
  if (dependencies.some(dependency => !isPlacementSourcePolicy(dependency))) {
    throw new Error('OG dependency manifest entries must be placement tuples')
  }
  if (!options.query) {
    await using transaction = await beginTransaction()
    const manifestId = await registerOgDependencyManifest(dependencies, { query: transaction })
    await transaction.commit()
    return manifestId
  }
  const query = options.query
  const { rows } = await query<{ id: string }>(sql`
    /* registerOgDependencyManifest */
    INSERT INTO og_dependency_manifests DEFAULT VALUES RETURNING id
  `)
  const manifestId = rows[0]?.id
  if (!manifestId) throw new Error('OG dependency manifest was not registered')
  if (dependencies.length === 0) return manifestId
  await query(sql`
    /* registerOgDependencyManifest:placements */
    INSERT INTO og_dependency_manifest_placements (
      manifest_id, placement_id, image_id, placement_revision, ordinal
    )
    SELECT ${manifestId}::uuid, dependency.placement_id, dependency.image_id,
      dependency.placement_revision, dependency.ordinal
    FROM unnest(
      ${dependencies.map(dependency => dependency.placementId)}::uuid[],
      ${dependencies.map(dependency => dependency.imageId)}::uuid[],
      ${dependencies.map(dependency => dependency.revision)}::integer[],
      ${dependencies.map((_, ordinal) => ordinal)}::integer[]
    ) AS dependency(placement_id, image_id, placement_revision, ordinal)
  `)
  return manifestId
}

/** Allows delivery only when the manifest exists and every recorded tuple is currently authorized. */
export async function authorizeOgDependencyManifest(
  manifestId: string,
  options: ManifestQueryOptions = {},
): Promise<'allow' | 'deny'> {
  const query = options.query ?? write
  const statement = sql`/* authorizeOgDependencyManifest */
    SELECT COALESCE((
      SELECT bool_and(`
  statement.append(imageDeliveryAuthorityProof())
  statement.append(sql`)
      FROM og_dependency_manifest_placements entry
      CROSS JOIN LATERAL (
        VALUES (entry.image_id, entry.placement_id, entry.placement_revision)
      ) AS authority(image_id, placement_id, placement_revision)
      WHERE entry.manifest_id = manifest.id
    ), TRUE) AS allowed
    FROM og_dependency_manifests manifest
    WHERE manifest.id = ${manifestId}::uuid
  `)
  const { rows } = await query<{ allowed: boolean }>(statement)
  return rows[0]?.allowed ? 'allow' : 'deny'
}
