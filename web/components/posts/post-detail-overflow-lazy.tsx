'use client'

import dynamic from 'next/dynamic'
import type { PostDetailOverflowMenuProps } from './post-detail-overflow-types'
import type { PostDetailOverflowMenu as PostDetailOverflowMenuComponent } from './post-detail-overflow-menu'

// ast-grep-ignore: no-dynamic-server-components -- this client wrapper preserves lazy loading when called by the server-rendered detail view
const PostDetailOverflowMenu = dynamic<Parameters<typeof PostDetailOverflowMenuComponent>[0]>(() =>
  import('./post-detail-overflow-menu').then(mod => mod.PostDetailOverflowMenu),
)

export function PostDetailOverflowLazy(props: PostDetailOverflowMenuProps) {
  return <PostDetailOverflowMenu {...props} />
}
