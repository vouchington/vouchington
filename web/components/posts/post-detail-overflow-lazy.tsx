'use client'

import dynamic from 'next/dynamic'
import type { PostDetailOverflowMenuProps } from './post-detail-overflow-types'

// ast-grep-ignore: no-dynamic-server-components -- this client wrapper preserves lazy loading when called by the server-rendered detail view
const PostDetailOverflowMenu = dynamic(() =>
  import('./post-detail-overflow-menu').then(mod => mod.PostDetailOverflowMenu),
)

export function PostDetailOverflowLazy(props: PostDetailOverflowMenuProps) {
  return <PostDetailOverflowMenu {...props} />
}
