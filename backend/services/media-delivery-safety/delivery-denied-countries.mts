import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

function pendingReset() {
  return sql`generation = registry.generation + 1, state = 'pending', claimed_at = NULL,
    completed_at = NULL, projected_at = NULL, invalidated_at = NULL, delivery_attempt_count = 0,
    next_attempt_at = NULL, failure_message = NULL`
}

export async function syncImagePlacementDeniedCountries(
  query: QueryExecutor,
  deliveryKey: string,
): Promise<{ deliveryKey: string; generation: string }> {
  const statement = sql`/* syncImagePlacementDeniedCountries */
    WITH desired AS (
      SELECT DISTINCT country.country_code
      FROM media_delivery_registry_records registry
      JOIN copyright_notice_targets target
        ON target.placement_key = concat('image-placement:', registry.placement_id)
      JOIN copyright_restrictions restriction
        ON restriction.copyright_notice_target_id = target.id
        AND restriction.lifted_at IS NULL AND restriction.applicability = 'countries'
      JOIN copyright_restriction_countries country
        ON country.copyright_restriction_id = restriction.id
      WHERE registry.delivery_key = ${deliveryKey} AND registry.desired_state = 'allow'
    ), deleted AS (
      DELETE FROM media_delivery_registry_denied_countries existing
      WHERE existing.delivery_key = ${deliveryKey}
        AND NOT EXISTS (SELECT 1 FROM desired WHERE desired.country_code = existing.country_code)
      RETURNING existing.delivery_key
    ), inserted AS (
      INSERT INTO media_delivery_registry_denied_countries (delivery_key, country_code)
      SELECT ${deliveryKey}, desired.country_code FROM desired
      WHERE NOT EXISTS (
        SELECT 1 FROM media_delivery_registry_denied_countries existing
        WHERE existing.delivery_key = ${deliveryKey} AND existing.country_code = desired.country_code
      )
      RETURNING delivery_key
    ), changed AS (
      SELECT delivery_key FROM deleted UNION SELECT delivery_key FROM inserted
    ), updated AS (
      UPDATE media_delivery_registry_records registry SET `
  statement.append(pendingReset())
  statement.append(sql`
      FROM changed WHERE registry.delivery_key = changed.delivery_key
      RETURNING registry.generation
    )
    SELECT COALESCE(
      (SELECT generation FROM updated LIMIT 1),
      (SELECT generation FROM media_delivery_registry_records WHERE delivery_key = ${deliveryKey})
    ) AS generation
  `)
  const { rows } = await query<{ generation: string }>(statement)
  const generation = rows[0]?.generation
  if (!generation) throw new Error(`Missing delivery registry row ${deliveryKey}`)
  return { deliveryKey, generation }
}

export async function syncPostImagePlacementDeniedCountries(
  query: QueryExecutor,
  postId: string,
): Promise<void> {
  const statement = sql`/* syncPostImagePlacementDeniedCountries */
    WITH keys AS (
      SELECT registry.delivery_key
      FROM media_delivery_registry_records registry
      JOIN image_placements binding ON binding.placement_id = registry.placement_id
      WHERE binding.post_id = ${postId}
    ), desired AS (
      SELECT DISTINCT registry.delivery_key, country.country_code
      FROM keys
      JOIN media_delivery_registry_records registry ON registry.delivery_key = keys.delivery_key
      JOIN copyright_notice_targets target
        ON target.placement_key = concat('image-placement:', registry.placement_id)
      JOIN copyright_restrictions restriction
        ON restriction.copyright_notice_target_id = target.id
        AND restriction.lifted_at IS NULL AND restriction.applicability = 'countries'
      JOIN copyright_restriction_countries country
        ON country.copyright_restriction_id = restriction.id
      WHERE registry.desired_state = 'allow'
    ), deleted AS (
      DELETE FROM media_delivery_registry_denied_countries existing
      USING keys
      WHERE existing.delivery_key = keys.delivery_key
        AND NOT EXISTS (
          SELECT 1 FROM desired
          WHERE desired.delivery_key = existing.delivery_key
            AND desired.country_code = existing.country_code
        )
      RETURNING existing.delivery_key
    ), inserted AS (
      INSERT INTO media_delivery_registry_denied_countries (delivery_key, country_code)
      SELECT desired.delivery_key, desired.country_code FROM desired
      WHERE NOT EXISTS (
        SELECT 1 FROM media_delivery_registry_denied_countries existing
        WHERE existing.delivery_key = desired.delivery_key
          AND existing.country_code = desired.country_code
      )
      RETURNING delivery_key
    ), changed AS (
      SELECT delivery_key FROM deleted UNION SELECT delivery_key FROM inserted
    )
    UPDATE media_delivery_registry_records registry SET `
  statement.append(pendingReset())
  statement.append(sql`
    FROM changed WHERE registry.delivery_key = changed.delivery_key
  `)
  await query(statement)
}
