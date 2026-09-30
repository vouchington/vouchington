/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { expect, test } from 'vitest'

type ChangeRecord = Record<string, unknown>

type ComputeRevisionChanges = (
  before: ChangeRecord | null,
  after: ChangeRecord | null,
) => Record<string, { before: unknown; after: unknown }>

type SingleFieldChange = {
  label: string
  field: string
  unchangedField: string
  before: ChangeRecord
  after: ChangeRecord
}

type DeletedAtChange = {
  label: string
  stableField: string
  stableValue: string
}

type RevisionChangeCases = {
  identical: ChangeRecord
  singleFieldChanges: readonly SingleFieldChange[]
  created: ChangeRecord
  multiple: {
    before: ChangeRecord
    after: ChangeRecord
    count: number
    samples: readonly string[]
  }
  untrackedField: string
  stableField: string
  stableValue: string
  deletedAt: DeletedAtChange
}

function registerDeletedAtChange(
  compute: ComputeRevisionChanges,
  deletedAt: DeletedAtChange,
): void {
  test.each([deletedAt])('$label', ({ stableField, stableValue }) => {
    const before = { [stableField]: stableValue, deleted_at: null }
    const after = {
      [stableField]: stableValue,
      deleted_at: new Date('2024-01-01'),
    }
    const changes = compute(before, after)
    expect(changes.deleted_at).toBeDefined()
    expect(changes[stableField]).toBeUndefined()
  })
}

function registerRevisionChangePrefix(
  compute: ComputeRevisionChanges,
  cases: RevisionChangeCases,
): void {
  test('returns empty object when before and after are identical', () => {
    expect(compute(cases.identical, cases.identical)).toEqual({})
  })

  test.each(cases.singleFieldChanges)('$label', change => {
    const changes = compute(change.before, change.after)
    expect(changes[change.field]).toEqual({
      before: change.before[change.field],
      after: change.after[change.field],
    })
    expect(changes[change.unchangedField]).toBeUndefined()
  })

  test('treats null and missing fields as null (create from scratch)', () => {
    const changes = compute(null, cases.created)
    for (const field of Object.keys(cases.created)) {
      expect(changes[field]).toEqual({ before: null, after: cases.created[field] })
    }
  })

  test('detects multiple changed fields', () => {
    const { before, after, count, samples } = cases.multiple
    const changes = compute(before, after)
    expect(Object.keys(changes)).toHaveLength(count)
    for (const field of samples) {
      expect(changes[field]).toEqual({ before: before[field], after: after[field] })
    }
  })

  test('ignores fields not in tracked list', () => {
    const before = { [cases.stableField]: cases.stableValue, [cases.untrackedField]: 'old' }
    const after = { [cases.stableField]: cases.stableValue, [cases.untrackedField]: 'new' }
    const changes = compute(before, after)
    expect(changes[cases.untrackedField]).toBeUndefined()
    expect(Object.keys(changes)).toHaveLength(0)
  })
}

const postRevisionChangeCases = {
  identical: { title: 'Hello', markdown: 'World', is_anonymous: false },
  singleFieldChanges: [
    {
      label: 'detects changed title',
      field: 'title',
      unchangedField: 'markdown',
      before: { title: 'Old Title', markdown: null },
      after: { title: 'New Title', markdown: null },
    },
    {
      label: 'detects changed markdown',
      field: 'markdown',
      unchangedField: 'title',
      before: { title: 'Title', markdown: 'Old content' },
      after: { title: 'Title', markdown: 'New content' },
    },
  ],
  created: { title: 'First Title', markdown: 'Content' },
  multiple: {
    before: { title: 'A', markdown: 'B', broadcast: 'everyone', privacy: 'public' },
    after: { title: 'X', markdown: 'Y', broadcast: 'users', privacy: 'private' },
    count: 4,
    samples: ['title', 'broadcast'],
  },
  untrackedField: 'some_other_field',
  stableField: 'title',
  stableValue: 'T',
  deletedAt: {
    label: 'handles null after (delete revision)',
    stableField: 'title',
    stableValue: 'Post',
  },
} satisfies RevisionChangeCases

const topicRevisionChangeCases = {
  identical: { name: 'My Topic', slug: 'my-topic', topic_type: 'topic' },
  singleFieldChanges: [
    {
      label: 'detects changed name',
      field: 'name',
      unchangedField: 'slug',
      before: { name: 'Old Name', slug: 'old-slug' },
      after: { name: 'New Name', slug: 'old-slug' },
    },
    {
      label: 'detects changed slug',
      field: 'slug',
      unchangedField: 'name',
      before: { name: 'Name', slug: 'old-slug' },
      after: { name: 'Name', slug: 'new-slug' },
    },
  ],
  created: { name: 'First Topic', slug: 'first-topic' },
  multiple: {
    before: { name: 'A', slug: 'a', topic_type: 'topic', markdown: null },
    after: { name: 'B', slug: 'b', topic_type: 'card', markdown: 'Desc' },
    count: 4,
    samples: ['topic_type', 'markdown'],
  },
  untrackedField: 'untracked_field',
  stableField: 'name',
  stableValue: 'T',
  deletedAt: {
    label: 'handles deleted_at change (delete revision)',
    stableField: 'name',
    stableValue: 'Topic',
  },
} satisfies RevisionChangeCases

const postNullBefore = {
  after: { title: 'New Post', markdown: 'Content', is_anonymous: false },
  fields: ['title', 'is_anonymous'] as const,
}

/** Call from a literal `describe`. Post field values stay in this registrar. */
export function registerPostRevisionChangeDetection(compute: ComputeRevisionChanges): void {
  registerRevisionChangePrefix(compute, postRevisionChangeCases)
  test('handles null before (create revision)', () => {
    const changes = compute(null, postNullBefore.after)
    for (const field of postNullBefore.fields) {
      expect(changes[field]).toEqual({ before: null, after: postNullBefore.after[field] })
    }
  })
  registerDeletedAtChange(compute, postRevisionChangeCases.deletedAt)
}

/** Call from a literal `describe`. Topic field values stay in this registrar. */
export function registerTopicRevisionChangeDetection(compute: ComputeRevisionChanges): void {
  registerRevisionChangePrefix(compute, topicRevisionChangeCases)
  registerDeletedAtChange(compute, topicRevisionChangeCases.deletedAt)
}
