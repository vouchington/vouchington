// Canonical definitions live in @voucha/types/entities/comment (avoids a
// services/comments <-> modules/search-utils workspace cycle: modules/search-utils
// needs these types but must not depend on @services/comments).
export type { CommentTreeOptions, CommentRow, CommentNode } from '@voucha/types/entities/comment'
