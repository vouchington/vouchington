import { describe, expect, it } from 'vitest'
import { collectNodes } from './plan-node-stats.mts'

describe('collectNodes', () => {
  it('attributes a disk-spilling sort exclusively, not to every ancestor that echoes it', () => {
    // Postgres reports Temp Read/Written Blocks cumulatively: the Limit and Append here echo
    // the Sort's own 5/5 because they include everything their descendants reported.
    const plan = {
      Plan: {
        'Node Type': 'Limit',
        'Temp Read Blocks': 5,
        'Temp Written Blocks': 5,
        Plans: [
          {
            'Node Type': 'Append',
            'Temp Read Blocks': 5,
            'Temp Written Blocks': 5,
            Plans: [
              {
                'Node Type': 'Sort',
                'Temp Read Blocks': 5,
                'Temp Written Blocks': 5,
                'Sort Space Type': 'Disk',
                Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'posts' }],
              },
            ],
          },
        ],
      },
    }

    const nodes = collectNodes(plan)
    const byType = Object.fromEntries(nodes.map(n => [n.nodeType, n]))

    expect(byType['Sort'].tempReadBlocks).toBe(5)
    expect(byType['Sort'].tempWrittenBlocks).toBe(5)
    expect(byType['Append'].tempReadBlocks).toBe(0)
    expect(byType['Append'].tempWrittenBlocks).toBe(0)
    expect(byType['Limit'].tempReadBlocks).toBe(0)
    expect(byType['Limit'].tempWrittenBlocks).toBe(0)
  })

  it('clamps exclusive counts to zero when loop-averaged parents round below their children', () => {
    const plan = {
      Plan: {
        'Node Type': 'Limit',
        'Temp Read Blocks': 10,
        Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'posts', 'Temp Read Blocks': 20 }],
      },
    }

    const nodes = collectNodes(plan)
    const limit = nodes.find(n => n.nodeType === 'Limit')

    expect(limit?.tempReadBlocks).toBe(0)
  })

  it('sums shared hit and read blocks into sharedBlocks', () => {
    const plan = {
      Plan: {
        'Node Type': 'Index Only Scan',
        'Relation Name': 'posts',
        'Shared Hit Blocks': 10_900,
        'Shared Read Blocks': 100,
      },
    }

    const [node] = collectNodes(plan)

    expect(node.sharedBlocks).toBe(11_000)
  })

  it('keeps shared-buffer counts cumulative so a scan split from its child is not hidden', () => {
    // A Bitmap Heap Scan's reported blocks already include its Bitmap Index Scan child's, per
    // Postgres's cumulative BUFFERS semantics. Unlike temp/WAL, shared buffers only ever feed a
    // single-node "costliest" pick, so there is no ancestor-echoing bug to guard against here —
    // subtracting the child would instead hide the parent's true 11,000-block total.
    const plan = {
      Plan: {
        'Node Type': 'Bitmap Heap Scan',
        'Relation Name': 'posts',
        'Shared Hit Blocks': 11_000,
        Plans: [{ 'Node Type': 'Bitmap Index Scan', 'Shared Hit Blocks': 6_000 }],
      },
    }

    const nodes = collectNodes(plan)
    const heapScan = nodes.find(n => n.nodeType === 'Bitmap Heap Scan')

    expect(heapScan?.sharedBlocks).toBe(11_000)
  })

  it('ignores invalid plan objects', () => {
    expect(collectNodes(null)).toEqual([])
    expect(collectNodes(undefined)).toEqual([])
    expect(collectNodes([])).toEqual([])
  })
})
