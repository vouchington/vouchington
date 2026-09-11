import { it, expect, describe } from 'vitest'
import { buildCrmOutreachSystemPrompt } from './build-system-prompt.mts'
import type { CrmContact, CrmContactSocialAccount } from '@voucha/types/entities/crm-contact'

describe('build-system-prompt', () => {
  const baseContact = {
    id: 'contact-1',
    name: 'Jane Doe',
    email: 'tests+jane@voucha.ai',
    vertical: 'travel',
    follower_count: 50_000,
  } as unknown as CrmContact

  it('maps contact fields into the outreach prompt', async () => {
    const prompt = await buildCrmOutreachSystemPrompt({ contact: baseContact })

    expect(prompt).toContain('Name: Jane Doe')
    expect(prompt).toContain('Email: tests+jane@voucha.ai')
    expect(prompt).toContain('Vertical: travel')
    expect(prompt).toContain('Follower count: 50,000')
    expect(prompt).toContain('<external-content')
    expect(prompt).toContain('contentType="contact-profile"')
    expect(prompt.indexOf('</external-content>')).toBeLessThan(prompt.indexOf('## Your Task'))
  })

  it('includes social accounts when provided', async () => {
    const socialAccounts: CrmContactSocialAccount[] = [
      {
        platform: 'instagram',
        handle: 'janetravel',
        follower_count: 45_000,
        contact_id: 'contact-1',
      } as unknown as CrmContactSocialAccount,
    ]

    const prompt = await buildCrmOutreachSystemPrompt({ contact: baseContact, socialAccounts })

    expect(prompt).toContain('- instagram: @janetravel (45,000 followers)')
  })

  it('shows none on file when no social accounts provided', async () => {
    const prompt = await buildCrmOutreachSystemPrompt({ contact: baseContact })

    expect(prompt).toContain('(none on file)')
  })

  it('handles missing optional fields gracefully', async () => {
    const minimalContact = {
      id: 'contact-2',
      name: 'John Smith',
      email: 'tests+john@voucha.ai',
      vertical: null,
      follower_count: null,
    } as unknown as CrmContact

    const prompt = await buildCrmOutreachSystemPrompt({ contact: minimalContact })

    expect(prompt).toContain('unknown')
  })
})
