import { describe, expect, it } from 'vitest'
import { checkPostPublicationWriterInventory } from './post-publication-writer-inventory.mts'

describe('current author publication capture contract', () => {
  it.each([
    'recordAuthorDeletionBeforePostReassignment',
    'recordPreparedAuthorDeletionPublicationWork',
    'recordUserDeletionPublicationCapture',
  ])('rejects the replaced helper %s', symbol => {
    const inventoryPath = 'static-code-analysis/post-publication-writer-inventory.json'
    const writerPath = 'backend/services/posts/write.mts'
    const capturePath = 'backend/services/post-publication/capture.mts'
    const files = new Map([
      [
        inventoryPath,
        JSON.stringify({
          version: 1,
          capture_api: capturePath,
          captured_writers: [writerPath],
          excluded_writers: [],
        }),
      ],
      [capturePath, ''],
      [
        writerPath,
        `import { ${symbol} } from '@services/post-publication'\nUPDATE posts SET title = $1\n${symbol}(query, userId)`,
      ],
    ])
    const errors: string[] = []
    checkPostPublicationWriterInventory(
      {
        trackedFiles: [...files.keys()],
        trackedFileSet: new Set(files.keys()),
        readTrackedFile: (path: string) => files.get(path) ?? null,
      } as never,
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: captured writer ${writerPath} must call an approved publication capture helper`,
    )
  })
})
