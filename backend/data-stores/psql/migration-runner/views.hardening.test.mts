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

  it('retains an unmanaged dependent when restricted teardown cannot progress', async () => {
    const graph = createForcedViewGraph()
    graphs.push(graph)
    const viewsDir = await writeForcedViewFiles(graph)
    await createForcedViewGraphBase(graph)
    await runViews('/unused-root', { folder: viewsDir })
    await createUnmanagedForcedViewDependent(graph)

    await expect(runViews('/unused-root', { folder: viewsDir, forced: true })).rejects.toThrow(
      `blocked views: ${graph.dependentView}`,
    )
    expect(await hasUnmanagedForcedViewDependent(graph)).toBe(true)
  })

  async function writeForcedViewFiles(
    graph: ReturnType<typeof createForcedViewGraph>,
  ): Promise<string> {
    const viewsDir = await mkdtemp(join(tmpdir(), 'voucha-forced-views-'))
    testDirs.push(viewsDir)
    await Promise.all([
      writeFile(
        join(viewsDir, '0010-dependent.sql'),
        `CREATE VIEW ${graph.dependentView} AS SELECT id FROM ${graph.materializedView};`,
      ),
      writeFile(
        join(viewsDir, '0020-base.sql'),
        `CREATE VIEW ${graph.baseView} AS SELECT id FROM ${graph.baseTable};`,
      ),
      writeFile(
        join(viewsDir, '0030-materialized.sql'),
        `CREATE MATERIALIZED VIEW ${graph.materializedView} AS SELECT id FROM ${graph.baseView};
         CREATE INDEX ${graph.materializedIndex} ON ${graph.materializedView} (id);
         COMMENT ON MATERIALIZED VIEW ${graph.materializedView} IS 'forced graph';`,
      ),
    ])
    return viewsDir
  }
})
