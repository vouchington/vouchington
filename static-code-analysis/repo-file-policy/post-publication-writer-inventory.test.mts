import { describe, expect, it } from 'vitest'
import { checkPostPublicationWriterInventory } from './post-publication-writer-inventory.mts'

const inventoryPath = 'static-code-analysis/post-publication-writer-inventory.json'
const writerPath = 'backend/services/posts/write.mts'

function context(
  inventory: object,
  source = 'recordPostPublicationChange(query, change)',
  captureImport: string | false = 'recordPostPublicationChange',
) {
  const captureModule =
    captureImport === 'recordUserDeletionPublicationCapture'
      ? './delete-publication-capture.mts'
      : '@services/post-publication'
  const files = new Map([
    [inventoryPath, JSON.stringify(inventory)],
    ['backend/services/post-publication/capture.mts', ''],
    [
      writerPath,
      `${captureImport ? `import { ${captureImport} } from '${captureModule}'\n` : ''}UPDATE posts SET title = $1\n${source}`,
    ],
  ])
  return {
    trackedFiles: [...files.keys()],
    trackedFileSet: new Set(files.keys()),
    readTrackedFile: (path: string) => files.get(path) ?? null,
  } as never
}

const inventory = {
  version: 1,
  capture_api: 'backend/services/post-publication/capture.mts',
  captured_writers: [writerPath],
  excluded_writers: [],
}

describe('post-publication writer inventory', () => {
  it('ignores repositories without the publication capture surface', () => {
    const errors: string[] = []
    checkPostPublicationWriterInventory(
      {
        trackedFiles: [],
        trackedFileSet: new Set(),
        readTrackedFile: () => null,
      } as never,
      errors,
    )
    expect(errors).toEqual([])
  })
  it('accepts a registered captured writer', () => {
    const errors: string[] = []
    checkPostPublicationWriterInventory(context(inventory), errors)
    expect(errors).toEqual([])
  })
  it.each([
    'recordPostUpdatePublicationChanges(query, params)',
    'recordPostRelatedUrlPublicationChanges(query, postIds)',
    'recordPreparedAuthorDeletionPublicationWork(query, userId, capture)',
    'recordUserDeletionPublicationCapture(query, userId, capture)',
  ])('accepts the focused capture helper %s', captureCall => {
    const errors: string[] = []
    const captureImport = captureCall.slice(0, captureCall.indexOf('('))
    const ctx = context(inventory, captureCall, captureImport)
    checkPostPublicationWriterInventory(ctx, errors)
    expect(errors).toEqual([])
  })
  it('rejects a new unlisted publication writer', () => {
    const errors: string[] = []
    const ctx = context(inventory) as {
      trackedFiles: string[]
      trackedFileSet: Set<string>
      readTrackedFile: (path: string) => string | null
    }
    ctx.trackedFiles.push('backend/services/posts/new-writer.mts')
    ctx.trackedFileSet.add('backend/services/posts/new-writer.mts')
    const read = ctx.readTrackedFile
    ctx.readTrackedFile = path =>
      path === 'backend/services/posts/new-writer.mts'
        ? 'const query = `DELETE FROM relation__post__category__topic_alias`'
        : read(path)
    checkPostPublicationWriterInventory(ctx as never, errors)
    expect(errors).toContain(
      `${inventoryPath}: unclassified publication writer backend/services/posts/new-writer.mts`,
    )
  })
  it('rejects malformed inventory and stale paths', () => {
    const malformed: string[] = []
    checkPostPublicationWriterInventory(context({}), malformed)
    expect(malformed).toContain(`${inventoryPath}: expected versioned capture and writer arrays`)
    const stale: string[] = []
    checkPostPublicationWriterInventory(
      context({ ...inventory, captured_writers: ['backend/services/posts/missing.mts'] }),
      stale,
    )
    expect(stale).toContain(
      `${inventoryPath}: stale tracked path backend/services/posts/missing.mts`,
    )
  })
  it('does not accept a capture symbol in a comment', () => {
    const errors: string[] = []
    checkPostPublicationWriterInventory(
      context(
        inventory,
        '// recordPostPublicationChange(query, change)\nUPDATE posts SET title = $1',
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: captured writer ${writerPath} must call an approved publication capture helper`,
    )
  })
  it('classifies quoted, schema-qualified, and UPDATE ONLY writer SQL', () => {
    const errors: string[] = []
    const ctx = context(inventory) as {
      trackedFiles: string[]
      trackedFileSet: Set<string>
      readTrackedFile: (path: string) => string | null
    }
    ctx.trackedFiles.push('backend/services/posts/qualified-writer.mts')
    ctx.trackedFileSet.add('backend/services/posts/qualified-writer.mts')
    const read = ctx.readTrackedFile
    ctx.readTrackedFile = path =>
      path === 'backend/services/posts/qualified-writer.mts'
        ? 'const query = `UPDATE ONLY public."posts" SET title = $1`'
        : read(path)
    checkPostPublicationWriterInventory(ctx as never, errors)
    expect(errors).toContain(
      `${inventoryPath}: unclassified publication writer backend/services/posts/qualified-writer.mts`,
    )
  })
  it('rejects capture-looking strings and unrelated executable calls', () => {
    const errors: string[] = []
    checkPostPublicationWriterInventory(
      context(
        inventory,
        'const note = "recordPostPublicationChange(query, change)"\nfunction recordPostPublicationChange() {}\nrecordPostPublicationChange',
        false,
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: captured writer ${writerPath} must call an approved publication capture helper`,
    )
  })

  it('rejects an unlisted dynamic SQL writer', () => {
    const errors: string[] = []
    const ctx = context(inventory) as {
      trackedFiles: string[]
      trackedFileSet: Set<string>
      readTrackedFile: (path: string) => string | null
    }
    const path = 'backend/services/posts/dynamic-writer.mts'
    ctx.trackedFiles.push(path)
    ctx.trackedFileSet.add(path)
    const read = ctx.readTrackedFile
    ctx.readTrackedFile = candidate =>
      candidate === path ? "const query = `UPDATE ${'posts'} SET value = $1`" : read(candidate)
    checkPostPublicationWriterInventory(ctx as never, errors)
    expect(errors).toContain(`${inventoryPath}: unclassified publication writer ${path}`)
  })

  it('detects an unlisted generated post-topic relation writer', () => {
    const errors: string[] = []
    const ctx = context(inventory) as {
      trackedFiles: string[]
      trackedFileSet: Set<string>
      readTrackedFile: (path: string) => string | null
    }
    const path = 'backend/services/entity-relations/generated-writer.mts'
    ctx.trackedFiles.push(path)
    ctx.trackedFileSet.add(path)
    const read = ctx.readTrackedFile
    ctx.readTrackedFile = candidate =>
      candidate === path
        ? 'const query = buildInsertQuery(relation, creator, pairs)'
        : read(candidate)
    checkPostPublicationWriterInventory(ctx as never, errors)
    expect(errors).toContain(`${inventoryPath}: unclassified publication writer ${path}`)
  })

  it('rejects an unlisted generated entity-relation vote writer', () => {
    const errors: string[] = []
    const ctx = context(inventory) as {
      trackedFiles: string[]
      trackedFileSet: Set<string>
      readTrackedFile: (path: string) => string | null
    }
    const path = 'backend/services/elections-votes/entity-relation/generated-vote-writer.mts'
    ctx.trackedFiles.push(path)
    ctx.trackedFileSet.add(path)
    const read = ctx.readTrackedFile
    ctx.readTrackedFile = candidate =>
      candidate === path
        ? `const table = assertWhitelistedSqlIdentifier(
          target.relationTable,
          entityRelationElectionTables,
          'entityRelationTable',
        )
        query.append(sql\`UPDATE \`)
        query.append(table)`
        : read(candidate)
    checkPostPublicationWriterInventory(ctx as never, errors)
    expect(errors).toContain(`${inventoryPath}: unclassified publication writer ${path}`)
  })

  it('requires generated post-topic writers to call the relation publication wrapper', () => {
    const errors: string[] = []
    const path = 'backend/services/entity-relations/generated-writer.mts'
    const generatedInventory = { ...inventory, captured_writers: [writerPath, path] }
    const ctx = context(generatedInventory) as {
      trackedFiles: string[]
      trackedFileSet: Set<string>
      readTrackedFile: (path: string) => string | null
    }
    ctx.trackedFiles.push(path)
    ctx.trackedFileSet.add(path)
    const read = ctx.readTrackedFile
    ctx.readTrackedFile = candidate =>
      candidate === path
        ? 'const query = buildInsertQuery(relation, creator, pairs)'
        : read(candidate)
    checkPostPublicationWriterInventory(ctx as never, errors)
    expect(errors).toContain(
      `${inventoryPath}: captured writer ${path} must call an approved publication capture helper`,
    )
  })

  it('detects an unlisted config-driven entity-table writer', () => {
    const errors: string[] = []
    const ctx = context(inventory) as {
      trackedFiles: string[]
      trackedFileSet: Set<string>
      readTrackedFile: (path: string) => string | null
    }
    const path = 'backend/services/elections-votes/post/config-writer.mts'
    ctx.trackedFiles.push(path)
    ctx.trackedFileSet.add(path)
    const read = ctx.readTrackedFile
    ctx.readTrackedFile = candidate =>
      candidate === path
        ? `const table = assertWhitelistedSqlIdentifier(
            config.entityTable,
            entityTables,
            'entityTable',
          )
          query.append(sql\`UPDATE \`)
          query.append(table)`
        : read(candidate)
    checkPostPublicationWriterInventory(ctx as never, errors)
    expect(errors).toContain(`${inventoryPath}: unclassified publication writer ${path}`)
  })

  it('does not classify interpolation outside a DML table position', () => {
    const errors: string[] = []
    const ctx = context(inventory) as {
      trackedFiles: string[]
      trackedFileSet: Set<string>
      readTrackedFile: (path: string) => string | null
    }
    const path = 'backend/services/posts/interpolated-read.mts'
    ctx.trackedFiles.push(path)
    ctx.trackedFileSet.add(path)
    const read = ctx.readTrackedFile
    ctx.readTrackedFile = candidate =>
      candidate === path ? 'const query = `SELECT ${column} FROM posts`' : read(candidate)
    checkPostPublicationWriterInventory(ctx as never, errors)
    expect(errors).toEqual([])
  })

  it('detects canonical RSS history and stories writers', () => {
    const errors: string[] = []
    const ctx = context(inventory) as {
      trackedFiles: string[]
      trackedFileSet: Set<string>
      readTrackedFile: (path: string) => string | null
    }
    for (const [path, sql] of [
      [
        'backend/services/rss-feeds/history.mts',
        'INSERT INTO rss_feed_enablement_changes (rss_feed_id) VALUES ($1)',
      ],
      ['backend/services/stories/update.mts', 'UPDATE stories SET title = $1'],
    ]) {
      ctx.trackedFiles.push(path)
      ctx.trackedFileSet.add(path)
      const read = ctx.readTrackedFile
      ctx.readTrackedFile = candidate =>
        candidate === path ? `const query = \`${sql}\`` : read(candidate)
    }
    checkPostPublicationWriterInventory(ctx as never, errors)
    expect(errors).toContain(
      `${inventoryPath}: unclassified publication writer backend/services/rss-feeds/history.mts`,
    )
    expect(errors).toContain(
      `${inventoryPath}: unclassified publication writer backend/services/stories/update.mts`,
    )
  })
})
