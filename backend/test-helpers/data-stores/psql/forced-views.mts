import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'

export type ForcedViewGraph = {
  baseTable: string
  baseView: string
  dependentView: string
  materializedView: string
  materializedIndex: string
  unmanagedView: string
}

export function createForcedViewGraph(): ForcedViewGraph {
  const suffix = randomUUID().replaceAll('-', '')
  return {
    baseTable: `forced_base_${suffix}`,
    baseView: `forced_base_view_${suffix}`,
    dependentView: `forced_dependent_${suffix}`,
    materializedView: `forced_materialized_${suffix}`,
    materializedIndex: `forced_index_${suffix}`,
    unmanagedView: `forced_unmanaged_${suffix}`,
  }
}

export async function createForcedViewGraphBase(graph: ForcedViewGraph): Promise<void> {
  await write(
    `/* createForcedViewGraphBase */ CREATE TABLE ${graph.baseTable} (id integer PRIMARY KEY)`,
  )
  await write(`/* createForcedViewGraphBase */ INSERT INTO ${graph.baseTable} (id) VALUES (1)`)
}

export async function createUnmanagedForcedViewDependent(graph: ForcedViewGraph): Promise<void> {
  await write(
    `/* createUnmanagedForcedViewDependent */
      CREATE MATERIALIZED VIEW ${graph.unmanagedView} AS
      SELECT id FROM ${graph.dependentView}`,
  )
}

export async function readForcedViewGraph(graph: ForcedViewGraph): Promise<{
  comment: string | null
  hasIndex: boolean
  ids: number[]
}> {
  const [graphResult, metadataResult] = await Promise.all([
    read<{ id: number }>(
      `/* readForcedViewGraph */ SELECT id FROM ${graph.dependentView} ORDER BY id`,
    ),
    read<{ comment: string | null; has_index: boolean }>(
      `/* readForcedViewGraphMetadata */
        SELECT obj_description($1::regclass) AS comment, to_regclass($2)::text IS NOT NULL AS has_index`,
      [graph.materializedView, graph.materializedIndex],
    ),
  ])
  return {
    comment: metadataResult.rows[0]?.comment ?? null,
    hasIndex: metadataResult.rows[0]?.has_index ?? false,
    ids: graphResult.rows.map(row => row.id),
  }
}

export async function hasUnmanagedForcedViewDependent(graph: ForcedViewGraph): Promise<boolean> {
  const { rows } = await read<{ present: boolean }>(
    `/* hasUnmanagedForcedViewDependent */
      SELECT to_regclass($1)::text IS NOT NULL AS present`,
    [graph.unmanagedView],
  )
  return rows[0]?.present ?? false
}

export async function dropForcedViewGraph(graph: ForcedViewGraph): Promise<void> {
  await write(`/* dropForcedViewGraph */ DROP MATERIALIZED VIEW IF EXISTS ${graph.unmanagedView}`)
  await write(`/* dropForcedViewGraph */ DROP VIEW IF EXISTS ${graph.dependentView}`)
  await write(
    `/* dropForcedViewGraph */ DROP MATERIALIZED VIEW IF EXISTS ${graph.materializedView}`,
  )
  await write(`/* dropForcedViewGraph */ DROP VIEW IF EXISTS ${graph.baseView}`)
  await write(`/* dropForcedViewGraph */ DROP TABLE IF EXISTS ${graph.baseTable}`)
}
