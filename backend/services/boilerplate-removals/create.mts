import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { ExtractDomRemovalsResult } from '@jongleberry/vurst-html'
import sql from 'sql-template-strings'
import type { BoilerplateRemoval } from './types.mts'

export const createBoilerplateRemoval = async (
  hostnameId: string,
  parentPath: string,
  results: ExtractDomRemovalsResult,
  urlIds: string[],
  queryOptions: QueryOptions = {},
): Promise<BoilerplateRemoval> => {
  if (urlIds.length === 0) {
    const { rows } = await write(
      sql`/* createBoilerplateRemoval */
      WITH existing_removal AS (
        SELECT id
        FROM hostname_path_boilerplate_removals
        WHERE hostname_id = ${hostnameId}
          AND parent_path = ${parentPath}
        ORDER BY id DESC
        LIMIT 1
      ),
      updated_removal AS (
        UPDATE hostname_path_boilerplate_removals
        SET
          results = ${JSON.stringify(results)}::jsonb
        WHERE id = (SELECT id FROM existing_removal)
        RETURNING id, hostname_id, parent_path, results, created_at, updated_at
      ),
      inserted_removal AS (
        INSERT INTO hostname_path_boilerplate_removals (hostname_id, parent_path, results)
        SELECT ${hostnameId}, ${parentPath}, ${JSON.stringify(results)}::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM updated_removal)
        RETURNING id, hostname_id, parent_path, results, created_at, updated_at
      )
      SELECT *
      FROM updated_removal
      UNION ALL
      SELECT *
      FROM inserted_removal
      `,
      undefined,
      queryOptions,
    )
    return rows[0] as BoilerplateRemoval
  }

  const { rows } = await write(
    sql`/* createBoilerplateRemoval */
    WITH existing_removal AS (
      SELECT id
      FROM hostname_path_boilerplate_removals
      WHERE hostname_id = ${hostnameId}
        AND parent_path = ${parentPath}
      ORDER BY id DESC
      LIMIT 1
    ),
    updated_removal AS (
      UPDATE hostname_path_boilerplate_removals
      SET
        results = ${JSON.stringify(results)}::jsonb
      WHERE id = (SELECT id FROM existing_removal)
      RETURNING id, hostname_id, parent_path, results, created_at, updated_at
    ),
    inserted_removal AS (
      INSERT INTO hostname_path_boilerplate_removals (hostname_id, parent_path, results)
      SELECT ${hostnameId}, ${parentPath}, ${JSON.stringify(results)}::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM updated_removal)
      RETURNING id, hostname_id, parent_path, results, created_at, updated_at
    ),
    upserted_removal AS (
      SELECT * FROM updated_removal
      UNION ALL
      SELECT * FROM inserted_removal
    ),
    cleared_urls AS (
      DELETE FROM hostname_path_boilerplate_removal_urls
      WHERE hostname_path_boilerplate_removal_id = (SELECT id FROM upserted_removal)
      RETURNING 1
    ),
    inserted_urls AS (
      INSERT INTO hostname_path_boilerplate_removal_urls (hostname_path_boilerplate_removal_id, url_id)
      SELECT
        (SELECT id FROM upserted_removal),
        url_id
      FROM unnest(${urlIds}::uuid[]) AS t(url_id)
      ORDER BY (SELECT id FROM upserted_removal), url_id
      ON CONFLICT (hostname_path_boilerplate_removal_id, url_id) DO NOTHING
      RETURNING 1
    )
    SELECT * FROM upserted_removal
    `,
    undefined,
    queryOptions,
  )

  return rows[0] as BoilerplateRemoval
}
