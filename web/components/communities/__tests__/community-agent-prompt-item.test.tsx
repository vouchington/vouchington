import {
  COMMUNITY_SLUG,
  mockNav,
  mocks,
  prompt,
  resetCommunityAgentPromptItemMocks,
} from '@/test-helpers/components/communities/community-agent-prompt-item.mock-support'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CommunityAgentPromptItem } from '../community-agent-prompt-item'

describe('CommunityAgentPromptItem', () => {
  afterEach(() => {
    resetCommunityAgentPromptItemMocks()
  })

  it('renders the item with prompt text', () => {
    render(
      <CommunityAgentPromptItem
        prompt={prompt({})}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(document.querySelector('[data-pw="community-agent-prompt-item"]')).not.toBeNull()
    expect(document.body.textContent).toContain('My test prompt text')
  })

  it('renders the Edit button when not editing', () => {
    render(
      <CommunityAgentPromptItem
        prompt={prompt({})}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    const editBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Edit',
    )
    expect(editBtn).not.toBeUndefined()
  })

  it('clicking Edit shows the edit textarea', () => {
    render(
      <CommunityAgentPromptItem
        prompt={prompt({})}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    const editBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Edit',
    )!
    fireEvent.click(editBtn)
    expect(document.querySelector('textarea[aria-label="Edit agent prompt"]')).not.toBeNull()
  })

  it('clicking Test toggles the simulation panel', () => {
    render(
      <CommunityAgentPromptItem
        prompt={prompt({})}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    const testBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Test',
    )!

    fireEvent.click(testBtn)
    expect(document.querySelector('[data-pw="community-agent-prompt-test-panel"]')).not.toBeNull()

    fireEvent.click(testBtn)
    expect(document.querySelector('[data-pw="community-agent-prompt-test-panel"]')).toBeNull()
  })

  it('renders Allocate button when slot is not allocated', () => {
    render(
      <CommunityAgentPromptItem
        prompt={prompt({ slot_allocated: false })}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    const allocateBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Allocate',
    )
    expect(allocateBtn).not.toBeUndefined()
  })

  it('renders Deallocate button when slot is allocated', () => {
    render(
      <CommunityAgentPromptItem
        prompt={prompt({ slot_allocated: true })}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    const deallocateBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Deallocate',
    )
    expect(deallocateBtn).not.toBeUndefined()
  })

  it('renders Delete button', () => {
    render(
      <CommunityAgentPromptItem
        prompt={prompt({})}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    const deleteBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Delete',
    )
    expect(deleteBtn).not.toBeUndefined()
  })

  it('clicking Delete shows a Confirm Delete button', () => {
    render(
      <CommunityAgentPromptItem
        prompt={prompt({})}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    const deleteBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Delete',
    )!
    fireEvent.click(deleteBtn)
    const confirmBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Confirm Delete',
    )
    expect(confirmBtn).not.toBeUndefined()
  })

  it('saving an edit calls updateCommunityAgentPrompt', async () => {
    mocks.updateCommunityAgentPrompt.mockResolvedValueOnce({
      community_agent_prompt: prompt({ prompt: 'Updated text' }),
    })

    render(
      <CommunityAgentPromptItem
        prompt={prompt({})}
        communitySlug={COMMUNITY_SLUG}
      />,
    )

    const editBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Edit',
    )!
    fireEvent.click(editBtn)

    const textarea = document.querySelector('textarea[aria-label="Edit agent prompt"]')!
    fireEvent.change(textarea, { target: { value: 'Updated text' } })

    const saveBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Save',
    )!
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(mocks.updateCommunityAgentPrompt).toHaveBeenCalledWith(COMMUNITY_SLUG, 'prompt-1', {
        prompt: 'Updated text',
      })
    })
    expect(mocks.onSuccess).toHaveBeenCalledWith('Prompt updated')
    expect(mockNav.refresh).toHaveBeenCalled()
  })

  it('clicking Confirm Delete calls deleteCommunityAgentPrompt', async () => {
    mocks.deleteCommunityAgentPrompt.mockResolvedValueOnce(undefined)

    render(
      <CommunityAgentPromptItem
        prompt={prompt({})}
        communitySlug={COMMUNITY_SLUG}
      />,
    )

    const deleteBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Delete',
    )!
    fireEvent.click(deleteBtn)

    const confirmBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Confirm Delete',
    )!
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mocks.deleteCommunityAgentPrompt).toHaveBeenCalledWith(COMMUNITY_SLUG, 'prompt-1')
    })
    expect(mocks.onSuccess).toHaveBeenCalledWith('Prompt deleted')
    expect(mockNav.refresh).toHaveBeenCalled()
  })

  it('clicking Allocate calls allocateCommunityAgentPromptSlot', async () => {
    mocks.allocateCommunityAgentPromptSlot.mockResolvedValueOnce(undefined)

    render(
      <CommunityAgentPromptItem
        prompt={prompt({ slot_allocated: false })}
        communitySlug={COMMUNITY_SLUG}
      />,
    )

    const allocateBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Allocate',
    )!
    fireEvent.click(allocateBtn)

    await waitFor(() => {
      expect(mocks.allocateCommunityAgentPromptSlot).toHaveBeenCalledWith(
        COMMUNITY_SLUG,
        'prompt-1',
      )
    })
    expect(mocks.onSuccess).toHaveBeenCalledWith('Slot allocated')
    expect(mockNav.refresh).toHaveBeenCalled()
  })

  it('clicking Deallocate calls deallocateCommunityAgentPromptSlot', async () => {
    mocks.deallocateCommunityAgentPromptSlot.mockResolvedValueOnce(undefined)

    render(
      <CommunityAgentPromptItem
        prompt={prompt({ slot_allocated: true })}
        communitySlug={COMMUNITY_SLUG}
      />,
    )

    const deallocateBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Deallocate',
    )!
    fireEvent.click(deallocateBtn)

    await waitFor(() => {
      expect(mocks.deallocateCommunityAgentPromptSlot).toHaveBeenCalledWith(
        COMMUNITY_SLUG,
        'prompt-1',
      )
    })
    expect(mocks.onSuccess).toHaveBeenCalledWith('Slot deallocated')
    expect(mockNav.refresh).toHaveBeenCalled()
  })
})
