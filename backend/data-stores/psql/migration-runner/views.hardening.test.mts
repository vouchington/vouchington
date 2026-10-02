import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  createForcedViewGraph,
  createForcedViewGraphBase,
  createUnmanagedForcedViewDependent,
  dropForcedViewGraph,
  hasUnmanagedForcedViewDependent,
  readForcedViewGraph,
} from '../../../test-helpers/data-stores/psql/forced-views.mts'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { loadSqlParserModule } from './sql-statements.mts'
import { runViews } from './views.mts'

describe('forced view rebuilding', () => {
  const testDirs: string[] = []
  const graphs = [] as ReturnType<typeof createForcedViewGraph>[]

  beforeAll(() => loadSqlParserModule())
  afterEach(async () => {
    await Promise.all(graphs.splice(0).map(dropForcedViewGraph))
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('rebuilds a randomized mixed graph from missing and existing managed views', async () => {
    const graph = createForcedViewGraph()
    graphs.push(graph)
    const viewsDir = await writeForcedViewFiles(graph)
    await createForcedViewGraphBase(graph)

    await runViews('/unused-root', { folder: viewsDir, forced: true })
    expect(await readForcedViewGraph(graph)).toEqual({
      comment: 'forced graph',
      hasIndex: true,
      ids: [1],
    })

    await runViews('/unused-root', { folder: viewsDir, forced: true })
    expect(await readForcedViewGraph(graph)).toEqual({
      comment: 'forced graph',
      hasIndex: true,
      ids: [1],
    })
  })

  it('rebuilds a mixed graph with quoted identifiers through the server-side teardown', async () => {
    const graph = createForcedViewGraph({ quoted: true })
    graphs.push(graph)
    const viewsDir = await writeForcedViewFiles(graph)
    await createForcedViewGraphBase(graph)

    await runViews('/unused-root', { folder: viewsDir, forced: true })
    await runViews('/unused-root', { folder: viewsDir, forced: true })

    expect(await readForcedViewGraph(graph)).toEqual({
      comment: 'forced graph',
      hasIndex: true,
      ids: [1],
    })
  })

  it('retains an unmanaged dependent when restricted teardown cannot progress', async () => {
    const graph = createForcedViewGraph()
    graphs.push(graph)
    const viewsDir = await writeForcedViewFiles(graph)
    await createForcedViewGraphBase(graph)
    await runViews('/unused-root', { folder: viewsDir })
    await createUnmanagedForcedViewDependent(graph)

    const error = await getForcedRebuildError(viewsDir)
    expect(() => {
      throw error
    }).toThrow(`blocked views: ${graph.dependentView}`)
    expect(error).toMatchObject({ detail: expect.stringContaining(graph.unmanagedView) })
    expect(await hasUnmanagedForcedViewDependent(graph)).toBe(true)
  })

  it('rolls back unrelated managed drops when another graph has an unmanaged dependent', async () => {
    const unblockedGraph = createForcedViewGraph()
    const blockedGraph = createForcedViewGraph()
    graphs.push(unblockedGraph, blockedGraph)
    const viewsDir = await writeForcedViewFiles(unblockedGraph, '00')
    await writeForcedViewFiles(blockedGraph, '10', viewsDir)
    await Promise.all([
      createForcedViewGraphBase(unblockedGraph),
      createForcedViewGraphBase(blockedGraph),
    ])
    await runViews('/unused-root', { folder: viewsDir })
    await createUnmanagedForcedViewDependent(blockedGraph)

    await expect(runViews('/unused-root', { folder: viewsDir, forced: true })).rejects.toThrow(
      `blocked views: ${blockedGraph.dependentView}`,
    )
    await expect(readForcedViewGraph(unblockedGraph)).resolves.toEqual({
      comment: 'forced graph',
      hasIndex: true,
      ids: [1],
    })
    await expect(readForcedViewGraph(blockedGraph)).resolves.toEqual({
      comment: 'forced graph',
      hasIndex: true,
      ids: [1],
    })
    expect(await hasUnmanagedForcedViewDependent(blockedGraph)).toBe(true)
  })

  async function writeForcedViewFiles(
    graph: ReturnType<typeof createForcedViewGraph>,
    prefix = '00',
    existingViewsDir?: string,
  ): Promise<string> {
    const viewsDir = existingViewsDir ?? (await mkdtemp(join(tmpdir(), 'voucha-forced-views-')))
    if (!existingViewsDir) testDirs.push(viewsDir)
    await Promise.all([
      writeFile(
        join(viewsDir, `${prefix}10-dependent.sql`),
        `CREATE VIEW ${graph.dependentView} AS SELECT id FROM ${graph.materializedView};`,
      ),
      writeFile(
        join(viewsDir, `${prefix}20-base.sql`),
        `CREATE VIEW ${graph.baseView} AS SELECT id FROM ${graph.baseTable};`,
      ),
      writeFile(
        join(viewsDir, `${prefix}30-materialized.sql`),
        `CREATE MATERIALIZED VIEW ${graph.materializedView} AS SELECT id FROM ${graph.baseView};
         CREATE INDEX ${graph.materializedIndex} ON ${graph.materializedView} (id);
         COMMENT ON MATERIALIZED VIEW ${graph.materializedView} IS 'forced graph';`,
      ),
    ])
    return viewsDir
  }
})

async function getForcedRebuildError(viewsDir: string): Promise<Error> {
  try {
    await runViews('/unused-root', { folder: viewsDir, forced: true })
  } catch (err) {
    if (err instanceof Error && 'detail' in err && typeof err.detail === 'string') return err
    throw err
  }
  throw new Error('Expected forced view rebuild to fail')
}
