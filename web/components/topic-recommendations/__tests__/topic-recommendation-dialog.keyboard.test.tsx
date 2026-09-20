import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TopicRecommendationDialog } from '../topic-recommendation-dialog'
import type { EditableState } from '../topic-recommendation-editable-state'
import type { Post } from '@/types/posts'

const baseRecommendation: Post = {
  id: 'topic-rec-1',
  post_type: 'topic_recommendation',
  title: 'Original title',
  markdown: 'Original rationale',
  root_id: null,
  created_by_id: 'user-1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'users',
  privacy: 'private',
  is_anonymous: false,

  community_id: null,

  clearance_status: 'approved',
  topic_recommendation: {
    post_id: 'topic-rec-1',
    topic_title: 'Original Topic',
    topic_slug: 'original-topic',
    topic_markdown: 'Original markdown',
    aliases: ['alias-one'],
    hostname_id: null,
    hostname: null,
    hostnames: [],
    approval_error_message: null,
    status: 'pending',
    reviewed_at: null,
    reviewed_by_id: null,
    rejection_reason: null,
    created_topic_id: null,
    topic_type: 'topic',
    example_referral_link: null,
    landing_page_urls: [],
  },
}

const editableState: EditableState = {
  topic_title: 'Original Topic',
  topic_slug: 'original-topic',
  topic_markdown: 'Topic markdown body',
  topic_hostname: 'example.com',
  topic_hostnames: 'example.com',
  topic_aliases: 'alias-one',
  rejection_reason: '',
  topic_type: 'topic',
  example_referral_link: '',
  landing_page_urls: '',
}

describe('TopicRecommendationDialog — keyboard submit', () => {
  it('renders editable inputs and the form wraps the fields', () => {
    const mockPersistChanges = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    render(
      <TopicRecommendationDialog
        editableState={editableState}
        isAdmin
        isSaving={false}
        selected={baseRecommendation}
        selectedHtml=''
        orderedPostIds={[baseRecommendation.id]}
        users={undefined}
        navigateToId={vi.fn<VitestLooseMock>()}
        setEditableState={vi.fn<VitestLooseMock>()}
        onApprove={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
        onOpenChange={vi.fn<VitestLooseMock>()}
        onPersistChanges={mockPersistChanges}
        onReject={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
      />,
    )

    // Title input is reachable inside the open dialog.
    const titleInput = screen.getByLabelText('Topic title') as HTMLInputElement
    expect(titleInput).toBeInTheDocument()

    // The Topic markdown textarea uses the design-system <Textarea> which auto-attaches
    // submitOnCmdEnter. The dialog is now wrapped in a <form> so Cmd/Ctrl+Enter should
    // trigger form submission without throwing.
    const markdownTextarea = screen.getByLabelText('Topic markdown') as HTMLTextAreaElement
    expect(markdownTextarea).toBeInTheDocument()
    expect(markdownTextarea.form).not.toBeNull()

    expect(() => {
      fireEvent.keyDown(markdownTextarea, { key: 'Enter', metaKey: true })
      fireEvent.keyDown(markdownTextarea, { key: 'Enter', ctrlKey: true })
      fireEvent.keyDown(markdownTextarea, { key: 'Enter' })
    }).not.toThrow()
  })

  it('Alt+A triggers approve when admin and status is pending', async () => {
    const mockApprove = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    render(
      <TopicRecommendationDialog
        editableState={editableState}
        isAdmin
        isSaving={false}
        selected={baseRecommendation}
        selectedHtml=''
        orderedPostIds={[baseRecommendation.id]}
        users={undefined}
        navigateToId={vi.fn<VitestLooseMock>()}
        setEditableState={vi.fn<VitestLooseMock>()}
        onApprove={mockApprove}
        onOpenChange={vi.fn<VitestLooseMock>()}
        onPersistChanges={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
        onReject={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
      />,
    )

    fireEvent.keyDown(window, { key: 'a', code: 'KeyA', altKey: true })

    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledWith(baseRecommendation)
    })
  })

  it('Alt+R triggers reject when admin and status is pending', async () => {
    const mockReject = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    render(
      <TopicRecommendationDialog
        editableState={editableState}
        isAdmin
        isSaving={false}
        selected={baseRecommendation}
        selectedHtml=''
        orderedPostIds={[baseRecommendation.id]}
        users={undefined}
        navigateToId={vi.fn<VitestLooseMock>()}
        setEditableState={vi.fn<VitestLooseMock>()}
        onApprove={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
        onOpenChange={vi.fn<VitestLooseMock>()}
        onPersistChanges={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
        onReject={mockReject}
      />,
    )

    fireEvent.keyDown(window, { key: 'r', code: 'KeyR', altKey: true })

    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith(baseRecommendation)
    })
  })

  it('Alt+A does not trigger approve for non-admin', async () => {
    const mockApprove = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    render(
      <TopicRecommendationDialog
        editableState={editableState}
        isAdmin={false}
        isSaving={false}
        selected={baseRecommendation}
        selectedHtml=''
        orderedPostIds={[baseRecommendation.id]}
        users={undefined}
        navigateToId={vi.fn<VitestLooseMock>()}
        setEditableState={vi.fn<VitestLooseMock>()}
        onApprove={mockApprove}
        onOpenChange={vi.fn<VitestLooseMock>()}
        onPersistChanges={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
        onReject={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
      />,
    )

    fireEvent.keyDown(window, { key: 'a', code: 'KeyA', altKey: true })

    expect(mockApprove).not.toHaveBeenCalled()
  })
})
