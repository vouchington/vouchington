import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { ExtractDomRemovalsResult } from '@jongleberry/vurst-html'
import sql from 'sql-template-strings'
import type { BoilerplateRemoval } from './types.mts'

function removalValues(results: ExtractDomRemovalsResult): {
  kinds: string[]
  ordinals: number[]
  values: string[]
} {
  const kinds: string[] = []
  const ordinals: number[] = []
  const values: string[] = []
  for (const [kind, entries] of [
    ['css_selector', results.cssSelectorsToRemove],
    ['html', results.htmlToRemove],
  ] as const) {
    entries.forEach((value, ordinal) => {
      kinds.push(kind)
      ordinals.push(ordinal)
      values.push(value)
    })
  }
  return { kinds, ordinals, values }
}

export function removalFromRow(row: {
  id: string
  hostname_id: string
  parent_path: string
  created_at: Date
  updated_at: Date
  css_selectors: string[] | null
  html_to_remove: string[] | null
}): BoilerplateRemoval {
  return {
    id: row.id,
    hostname_id: row.hostname_id,
    parent_path: row.parent_path,
    created_at: row.created_at,
    updated_at: row.updated_at,
    results: {
      cssSelectorsToRemove: row.css_selectors ?? [],
      htmlToRemove: row.html_to_remove ?? [],
    },
  }
}

export const createBoilerplateRemoval = async (
  hostnameId: string,
  parentPath: string,
  results: ExtractDomRemovalsResult,
  urlIds: string[],
  queryOptions: QueryOptions = {},
): Promise<BoilerplateRemoval> => {
  const stored = removalValues(results)
  const { rows } = await write(
    sql`/* createBoilerplateRemoval */
    WITH existing_removal AS (
      SELECT id
      FROM boilerplate_removals
      WHERE hostname_id = ${hostnameId}
        AND parent_path = ${parentPath}
      ORDER BY id DESC
      LIMIT 1
    ),
    updated_removal AS (
      UPDATE boilerplate_removals
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = (SELECT id FROM existing_removal)
      RETURNING *
    ),
    inserted_removal AS (
      INSERT INTO boilerplate_removals (hostname_id, parent_path)
      SELECT ${hostnameId}, ${parentPath}
      WHERE NOT EXISTS (SELECT 1 FROM updated_removal)
      RETURNING *
    ),
    upserted_removal AS (
      SELECT * FROM updated_removal
      UNION ALL
      SELECT * FROM inserted_removal
    ),
    cleared_results AS (
      DELETE FROM boilerplate_removal_results
      WHERE boilerplate_removal_id = (SELECT id FROM upserted_removal)
      RETURNING 1
    ),
    inserted_results AS (
      INSERT INTO boilerplate_removal_results (boilerplate_removal_id, kind, ordinal, value)
      SELECT
        (SELECT id FROM upserted_removal),
        kind::boilerplate_removal_result_kinds,
        ordinal,
        value
      FROM UNNEST(
        ${stored.kinds}::text[],
        ${stored.ordinals}::int[],
        ${stored.values}::text[]
      ) AS input(kind, ordinal, value)
      CROSS JOIN (
        SELECT 1 FROM cleared_results
        UNION ALL
        SELECT 1
        LIMIT 1
      ) AS sequenced
      WHERE (SELECT id FROM upserted_removal) IS NOT NULL
      ORDER BY kind, ordinal
      RETURNING 1
    ),
    cleared_urls AS (
      DELETE FROM boilerplate_removal_urls
      WHERE boilerplate_removal_id = (SELECT id FROM upserted_removal)
        AND ${urlIds.length > 0}
      RETURNING 1
    ),
    inserted_urls AS (
      INSERT INTO boilerplate_removal_urls (boilerplate_removal_id, url_id)
      SELECT (SELECT id FROM upserted_removal), url_id
      FROM unnest(${urlIds}::uuid[]) AS t(url_id)
      WHERE ${urlIds.length > 0}
      ORDER BY (SELECT id FROM upserted_removal), url_id
      ON CONFLICT (boilerplate_removal_id, url_id) DO NOTHING
      RETURNING 1
    )
    SELECT
      removal.id,
      removal.hostname_id,
      removal.parent_path,
      removal.created_at,
      removal.updated_at,
      COALESCE((
        SELECT jsonb_agg(value ORDER BY ordinal)
        FROM boilerplate_removal_results
        WHERE boilerplate_removal_id = removal.id AND kind = 'css_selector'
      ), '[]'::jsonb) AS css_selectors,
      COALESCE((
        SELECT jsonb_agg(value ORDER BY ordinal)
        FROM boilerplate_removal_results
        WHERE boilerplate_removal_id = removal.id AND kind = 'html'
      ), '[]'::jsonb) AS html_to_remove
    FROM upserted_removal removal
    `,
    undefined,
    queryOptions,
  )
  return removalFromRow(rows[0])
}
