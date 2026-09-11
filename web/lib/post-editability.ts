export type EditablePostType = 'review' | 'discussion' | 'data_point' | 'article' | 'blog_post'

const EDITABLE_POST_TYPES: ReadonlySet<string> = new Set<EditablePostType>([
  'review',
  'discussion',
  'data_point',
  'article',
  'blog_post',
])

/**
 * Returns true if the given post type supports editing (title, body, structured data).
 * Canonical single-source predicate shared across overflow-guard and edit-route factories.
 */
export function isEditablePostType(postType: string): postType is EditablePostType {
  return EDITABLE_POST_TYPES.has(postType)
}
