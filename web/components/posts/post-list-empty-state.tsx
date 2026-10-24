import Link from 'next/link'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import type { PostRouteConfig } from '@/lib/route-configs'

const createRoutes: Partial<Record<string, string>> = {
  reviews: '/reviews/create',
  discussions: '/discussions/create',
  'data-points': '/data-points/create',
}

export function PostListEmptyState({
  config,
  isAuthenticated,
  hasSearch,
}: {
  config: PostRouteConfig
  isAuthenticated: boolean
  hasSearch: boolean
}) {
  if (hasSearch) {
    return (
      <EmptyState
        title='No results found'
        description='Try adjusting your search or filters'
        icon='search'
      />
    )
  }

  const path = createRoutes[config.pluralPath]
  const singularLabel = config.singularPath.replace(/-/g, ' ')

  if (path && isAuthenticated) {
    return (
      <EmptyState
        title={`No ${config.pluralPath.replace(/-/g, ' ')} yet`}
        description={`Be the first to share a ${singularLabel}.`}
        icon='pen-line'
      >
        <Button
          asChild
          size='sm'
        >
          <Link
            data-pw='post-list-page-create'
            href={path}
            prefetch={false}
          >
            Create {singularLabel}
          </Link>
        </Button>
      </EmptyState>
    )
  }

  if (path) {
    return (
      <EmptyState
        title={`No ${config.pluralPath.replace(/-/g, ' ')} yet`}
        description={`Sign in to share a ${singularLabel}.`}
        icon='pen-line'
      >
        <Button
          asChild
          size='sm'
          variant='outline'
        >
          <Link
            data-pw='post-list-page-sign-in'
            href='/login'
            prefetch={false}
          >
            Sign in
          </Link>
        </Button>
      </EmptyState>
    )
  }

  return (
    <EmptyState
      title={`No ${config.pluralPath.replace(/-/g, ' ')} found`}
      description='Try adjusting your search or filters'
    />
  )
}
