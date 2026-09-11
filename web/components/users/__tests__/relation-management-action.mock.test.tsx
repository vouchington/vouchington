import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import type { EntityBookmarkButtonProps } from '@/components/shared/entity-bookmark-button'
import {
  RelationManagementAction,
  type RelationManagementActionConfig,
} from '../relation-management-action'

const mockRefresh = createNavMock().refresh

vi.mock(import('next/navigation'), () => navMockModule)

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: ({ onChange }: EntityBookmarkButtonProps) => (
    <>
      <button
        type='button'
        onClick={() => onChange?.(false)}
      >
        Remove relation
      </button>
      <button
        type='button'
        onClick={() => onChange?.(true)}
      >
        Add relation
      </button>
    </>
  ),
}))

const config: RelationManagementActionConfig = {
  entityType: 'post',
  predicate: 'save',
  activeLabel: 'extracted.userProfileCollections.postsTopics.saved_b5c120b3',
  inactiveLabel: 'extracted.userProfileCollections.postsTopics.save_1509f561',
  errorLabel: 'extracted.userProfileCollections.postsTopics.savedPost_f7486726',
}

describe('RelationManagementAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports a successful inactive relation before refreshing canonical server data', () => {
    const onRemoved = vi.fn<(entityId: string) => void>()
    render(
      <RelationManagementAction
        entityId='post-1'
        config={config}
        onRemoved={onRemoved}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove relation' }))

    expect(onRemoved).toHaveBeenCalledWith('post-1')
    expect(mockRefresh).toHaveBeenCalledOnce()
    expect(onRemoved.mock.invocationCallOrder[0]).toBeLessThan(
      mockRefresh.mock.invocationCallOrder[0]!,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add relation' }))
    expect(onRemoved).toHaveBeenCalledOnce()
    expect(mockRefresh).toHaveBeenCalledOnce()
  })
})
