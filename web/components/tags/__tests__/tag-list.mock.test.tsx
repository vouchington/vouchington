import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TagList } from '../tag-list'
import type { EntityRelation } from '@/lib/api/entity-relations'

const mockTagItem = vi.fn<VitestLooseMock>()

vi.mock(import('../tag-item'), () => ({
  TagItem: ({ relation, ...props }: { relation: EntityRelation }) => {
    mockTagItem(props)
    return <div data-testid='tag-item'>{relation.object_id}</div>
  },
}))

describe('TagList', () => {
  it('renders an empty state when there are no relations', () => {
    render(
      <TagList
        relations={[]}
        objectType='topic'
      />,
    )
    expect(screen.getByText('No topics tagged yet.')).toBeInTheDocument()
  })

  it('renders a tag item for each relation', () => {
    render(
      <TagList
        relations={[
          {
            id: 'relation-1',
            object_id: 'topic-1',
            created_at: '2026-05-24T00:00:00.000Z',
            created_by_id: 'user-1',
            object_data: {},
          },
        ]}
        electionVotes={{ 'relation-1': { choice: 'confirm' } }}
        objectType='topic'
        showVoting
        isAuthenticated
      />,
    )
    expect(screen.getByTestId('tag-item')).toHaveTextContent('topic-1')
  })

  it('preserves the official-account exemption for structural tag relations by default', () => {
    render(
      <TagList
        relations={[
          {
            id: 'relation-1',
            object_id: 'topic-1',
            created_at: '2026-05-24T00:00:00.000Z',
            created_by_id: 'user-1',
            object_data: {},
          },
        ]}
        objectType='topic'
      />,
    )

    expect(mockTagItem.mock.lastCall?.[0]).toMatchObject({ allowOfficialAccounts: true })
  })
})
