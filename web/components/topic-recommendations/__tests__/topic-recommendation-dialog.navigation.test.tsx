import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TopicRecommendationDialog } from '../topic-recommendation-dialog'
import { buildEditableState } from '../topic-recommendation-editable-state'
import type { Post } from '@/types/posts'

function makePendingPost(id: string, slug: string): Post {
  return {
    id,
    post_type: 'topic_recommendation',
    title: `Title for ${id}`,
    markdown: 'Rationale',
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
      post_id: id,
      topic_title: `Topic ${id}`,
      topic_slug: slug,
      topic_markdown: '',
      aliases: [],
      hostname_id: null,
      hostname: null,
      hostnames: [],
      topic_wikipedia_pageid: null,
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
}

const post1 = makePendingPost('id-1', 'slug-one')
const post2 = makePendingPost('id-2', 'slug-two')
const post3 = makePendingPost('id-3', 'slug-three')
const orderedPostIds = [post1.id, post2.id, post3.id]

function renderDialog(selectedPost: Post, navigateToId = vi.fn<VitestLooseMock>()) {
  const editableState = buildEditableState(selectedPost)
  // Dialog renders into a portal on document.body; use baseElement to query portal content
  const result = render(
    <TopicRecommendationDialog
      editableState={editableState}
      isAdmin
      isSaving={false}
      selected={selectedPost}
      selectedHtml=''
      orderedPostIds={orderedPostIds}
      users={undefined}
      navigateToId={navigateToId}
      setEditableState={vi.fn<VitestLooseMock>()}
      onApprove={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
      onOpenChange={vi.fn<VitestLooseMock>()}
      onPersistChanges={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
      onReject={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
    />,
  )
  return { ...result, body: result.baseElement }
}

function getPrev(body: HTMLElement) {
  return body.querySelector(
    '[data-pw="topic-recommendation-dialog-previous"]',
  ) as HTMLButtonElement | null
}

function getNext(body: HTMLElement) {
  return body.querySelector(
    '[data-pw="topic-recommendation-dialog-next"]',
  ) as HTMLButtonElement | null
}

describe('TopicRecommendationDialog — navigation', () => {
  it('disables Previous button when on first item', () => {
    const { body } = renderDialog(post1)
    const prev = getPrev(body)
    expect(prev).not.toBeNull()
    expect(prev!.disabled).toBe(true)
  })

  it('disables Next button when on last item', () => {
    const { body } = renderDialog(post3)
    const next = getNext(body)
    expect(next).not.toBeNull()
    expect(next!.disabled).toBe(true)
  })

  it('enables both Previous and Next when on a middle item', () => {
    const { body } = renderDialog(post2)
    const prev = getPrev(body)
    const next = getNext(body)
    expect(prev).not.toBeNull()
    expect(next).not.toBeNull()
    expect(prev!.disabled).toBe(false)
    expect(next!.disabled).toBe(false)
  })

  it('calls navigateToId with previous post id when Previous is clicked', () => {
    const mockNavigate = vi.fn<VitestLooseMock>()
    const { body } = renderDialog(post2, mockNavigate)
    const prev = getPrev(body)
    expect(prev).not.toBeNull()
    fireEvent.click(prev!)
    expect(mockNavigate).toHaveBeenCalledWith(post1.id)
  })

  it('calls navigateToId with next post id when Next is clicked', () => {
    const mockNavigate = vi.fn<VitestLooseMock>()
    const { body } = renderDialog(post2, mockNavigate)
    const next = getNext(body)
    expect(next).not.toBeNull()
    fireEvent.click(next!)
    expect(mockNavigate).toHaveBeenCalledWith(post3.id)
  })

  it('calls navigateToId with previous id on ArrowLeft keydown', () => {
    const mockNavigate = vi.fn<VitestLooseMock>()
    renderDialog(post2, mockNavigate)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(mockNavigate).toHaveBeenCalledWith(post1.id)
  })

  it('calls navigateToId with next id on ArrowRight keydown', () => {
    const mockNavigate = vi.fn<VitestLooseMock>()
    renderDialog(post2, mockNavigate)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(mockNavigate).toHaveBeenCalledWith(post3.id)
  })

  it('does not navigate on ArrowLeft when an input is focused', () => {
    const mockNavigate = vi.fn<VitestLooseMock>()
    renderDialog(post2, mockNavigate)
    const titleInput = screen.getByLabelText('Topic title')
    // Firing keydown with event.target set to an INPUT element — handler checks tagName
    fireEvent.keyDown(titleInput, { key: 'ArrowLeft' })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('next button enabled on first item when multiple items exist', () => {
    const { body } = renderDialog(post1)
    const next = getNext(body)
    expect(next).not.toBeNull()
    expect(next!.disabled).toBe(false)
  })

  it('previous button enabled on last item when multiple items exist', () => {
    const { body } = renderDialog(post3)
    const prev = getPrev(body)
    expect(prev).not.toBeNull()
    expect(prev!.disabled).toBe(false)
  })
})
