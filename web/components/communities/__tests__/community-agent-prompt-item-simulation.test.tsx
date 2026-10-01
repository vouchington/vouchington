import {
  COMMUNITY_SLUG,
  mocks,
  prompt,
  resetCommunityAgentPromptItemMocks,
} from '@/test-helpers/components/communities/community-agent-prompt-item.mock-support'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CommunityAgentPromptItem } from '../community-agent-prompt-item'

describe('CommunityAgentPromptItem simulation', () => {
  afterEach(() => {
    resetCommunityAgentPromptItemMocks()
  })

  it('clicking Test shows the simulation panel', () => {
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
  })

  it('runs an automod simulation and renders projected matches', async () => {
    mocks.simulateCommunityAutomod.mockResolvedValueOnce({
      simulation: {
        prompt_id: 'prompt-1',
        time_window_hours: 168,
        sample_count: 2,
        would_flag_count: 1,
        community_automod_action: 'record_only',
        false_positive_estimate: {
          historical_flagged_count: 0,
          historical_approved_count: 0,
          rate: null,
        },
      },
      results: [
        {
          post_id: 'post-1',
          title: 'Matched post',
          post_type: 'discussion',
          approved_at: '2026-01-01T00:00:00.000Z',
          content_excerpt: 'Matched post body',
          flagged: true,
          reason: 'Matches test prompt',
        },
      ],
    })

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
    const runBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Run Test',
    )!
    fireEvent.click(runBtn)

    await waitFor(() => {
      expect(mocks.simulateCommunityAutomod).toHaveBeenCalledWith(COMMUNITY_SLUG, {
        prompt_id: 'prompt-1',
        prompt: undefined,
        time_window_hours: 168,
        limit: 25,
      })
    })
    expect(document.querySelector('[data-pw="community-agent-prompt-test-results"]')).not.toBeNull()
    expect(document.body.textContent).toContain('Matches test prompt')
  })

  it('clears stale simulation results when the draft prompt changes', async () => {
    mocks.simulateCommunityAutomod.mockResolvedValueOnce({
      simulation: {
        prompt_id: 'prompt-1',
        time_window_hours: 168,
        sample_count: 1,
        would_flag_count: 1,
        community_automod_action: 'record_only',
        false_positive_estimate: null,
      },
      results: [
        {
          post_id: 'post-1',
          title: 'Matched post',
          post_type: 'discussion',
          approved_at: '2026-01-01T00:00:00.000Z',
          content_excerpt: 'Matched post body',
          flagged: true,
          reason: 'Old simulation result',
        },
      ],
    })

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
    const runBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Run Test',
    )!
    fireEvent.click(runBtn)

    await waitFor(() => {
      expect(document.body.textContent).toContain('Old simulation result')
    })

    fireEvent.change(document.querySelector('textarea')!, {
      target: { value: 'Changed draft prompt' },
    })

    expect(document.querySelector('[data-pw="community-agent-prompt-test-results"]')).toBeNull()
    expect(document.body.textContent).not.toContain('Old simulation result')
  })

  it('validates prompt text before running a simulation', () => {
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
    fireEvent.change(document.querySelector('textarea')!, { target: { value: '   ' } })
    const runBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Run Test',
    )!
    fireEvent.click(runBtn)

    expect(document.body.textContent).toContain('Prompt is required')
    expect(mocks.simulateCommunityAutomod).not.toHaveBeenCalled()
  })

  it('reports failed simulations through onError', async () => {
    mocks.simulateCommunityAutomod.mockRejectedValueOnce(new Error('simulation failed'))

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
    const runBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Run Test',
    )!
    fireEvent.click(runBtn)

    await waitFor(() => {
      expect(mocks.onError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Failed to run simulation',
      })
    })
  })
})
