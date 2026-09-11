import { describe, expect, it } from 'vitest'
import { checkPostPublicationWriterInventory } from './post-publication-writer-inventory.mts'

const inventoryPath = 'static-code-analysis/post-publication-writer-inventory.json'
const writerPath = 'backend/services/posts/write.mts'
const inventory = {
  version: 1,
  capture_api: 'backend/services/post-publication/capture.mts',
  captured_writers: [writerPath],
  excluded_writers: [],
}

function context(
  writerSource = "import { recordPostPublicationChange } from '@services/post-publication'\nUPDATE posts SET title = $1\nrecordPostPublicationChange(query, change)",
) {
  const files = new Map([
    [inventoryPath, JSON.stringify(inventory)],
    ['backend/services/post-publication/capture.mts', ''],
    [writerPath, writerSource],
  ])
  return {
    trackedFiles: [...files.keys()],
    trackedFileSet: new Set(files.keys()),
    readTrackedFile: (path: string) => files.get(path) ?? null,
  } as never
}

function addSource(
  ctx: {
    trackedFiles: string[]
    trackedFileSet: Set<string>
    readTrackedFile: (path: string) => string | null
  },
  path: string,
  source: string,
) {
  ctx.trackedFiles.push(path)
  ctx.trackedFileSet.add(path)
  const read = ctx.readTrackedFile
  ctx.readTrackedFile = candidate => (candidate === path ? source : read(candidate))
}

describe('post-publication writer inventory regressions', () => {
  it('rejects a capture call without an approved imported binding', () => {
    const errors: string[] = []
    checkPostPublicationWriterInventory(
      context('UPDATE posts SET title = $1\nrecordPostPublicationChange(query, change)'),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: captured writer ${writerPath} must call an approved publication capture helper`,
    )
  })

  it('accepts a top-level aliased capture binding', () => {
    const errors: string[] = []
    checkPostPublicationWriterInventory(
      context(
        "import { recordPostPublicationChange as capture } from '@services/post-publication'\ncapture(query, change)",
      ),
      errors,
    )
    expect(errors).toEqual([])
  })

  it('rejects a non-string exclusion reason without throwing', () => {
    const errors: string[] = []
    const malformedInventory = {
      ...inventory,
      excluded_writers: [{ path: 'backend/services/posts/excluded.mts', reason: null }],
    }
    const malformedContext = context() as {
      trackedFiles: string[]
      trackedFileSet: Set<string>
      readTrackedFile: (path: string) => string | null
    }
    const read = malformedContext.readTrackedFile
    malformedContext.readTrackedFile = path =>
      path === inventoryPath ? JSON.stringify(malformedInventory) : read(path)
    expect(() =>
      checkPostPublicationWriterInventory(malformedContext as never, errors),
    ).not.toThrow()
    expect(errors).toContain(`${inventoryPath}: exclusions require a path and reason`)
  })

  it('classifies quoted SQL and capture opt-outs outside services', () => {
    const errors: string[] = []
    const ctx = context() as {
      trackedFiles: string[]
      trackedFileSet: Set<string>
      readTrackedFile: (path: string) => string | null
    }
    const quotedWriter = 'backend/services/posts/quoted-writer.mts'
    const bypassWriter = 'backend/agents/publication-bypass.mts'
    addSource(ctx, quotedWriter, "const query = 'UPDATE posts SET title = $1'")
    addSource(ctx, bypassWriter, 'run({ capturePublication: false })')

    checkPostPublicationWriterInventory(ctx as never, errors)

    expect(errors).toContain(`${inventoryPath}: unclassified publication writer ${quotedWriter}`)
    expect(errors).toContain(`${inventoryPath}: unclassified publication writer ${bypassWriter}`)
  })

  it('preserves combined diagnostic order', () => {
    const errors: string[] = []
    const ctx = context('recordPostPublicationChange(query, change)') as {
      trackedFiles: string[]
      trackedFileSet: Set<string>
      readTrackedFile: (path: string) => string | null
    }
    addSource(
      ctx,
      'backend/services/posts/new-writer.mts',
      'const query = `UPDATE posts SET title = $1`',
    )
    addSource(ctx, 'backend/agents/publication-bypass.mts', 'run({ capturePublication: false })')
    checkPostPublicationWriterInventory(ctx as never, errors)
    expect(errors).toEqual([
      `${inventoryPath}: captured writer ${writerPath} must call an approved publication capture helper`,
      `${inventoryPath}: unclassified publication writer backend/services/posts/new-writer.mts`,
      `${inventoryPath}: unclassified publication writer backend/agents/publication-bypass.mts`,
    ])
  })
})
