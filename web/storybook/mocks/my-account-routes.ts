import { landingPageWithItems } from '@/storybook/entities/fixtures/landing'
import type { LandingPageItem, LandingPageWithItems } from '@/types/landing-pages'

function record(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
}

function textField(body: unknown, key: string): string {
  const value = record(body)[key]
  return typeof value === 'string' ? value : ''
}

function topicNames(body: unknown): string[] {
  const names = record(body).names
  return Array.isArray(names)
    ? names.filter((name): name is string => typeof name === 'string')
    : []
}

function matchesSubmittedItem(existing: LandingPageItem, input: Record<string, unknown>): boolean {
  if (existing.type === 'profile_link' && input.type === 'profile_link') {
    return existing.profile_link.id === input.profile_link_id
  }
  if (existing.type === 'review' && input.type === 'review')
    return existing.review.id === input.review_id
  if (existing.type === 'referral_link' && input.type === 'referral_link') {
    return existing.referral_link.id === input.referral_link_id
  }
  if (existing.type === 'topic_group' && input.type === 'topic_group') {
    return existing.topic.id === input.topic_id
  }
  return false
}

function submittedItems(fields: Record<string, unknown>): LandingPageItem[] | undefined {
  if (!Array.isArray(fields.items)) return undefined
  return fields.items.flatMap(item => {
    const input = record(item)
    if (input.type === 'link') {
      const label = typeof input.label === 'string' ? input.label : 'Link'
      const url = typeof input.url === 'string' ? input.url : 'https://example.com'
      return [{ id: `lp-link-${url}`, type: 'link' as const, label, url }]
    }
    const match = landingPageWithItems.items.find(existing => matchesSubmittedItem(existing, input))
    return match ? [match] : []
  })
}

export function updatedLandingPage(body: unknown): LandingPageWithItems {
  const fields = record(body)
  const items = submittedItems(fields)
  return {
    ...landingPageWithItems,
    title: typeof fields.title === 'string' ? fields.title : landingPageWithItems.title,
    subtitle:
      typeof fields.subtitle === 'string' || fields.subtitle === null
        ? fields.subtitle
        : landingPageWithItems.subtitle,
    slug: typeof fields.slug === 'string' ? fields.slug : landingPageWithItems.slug,
    is_default: fields.is_default === true || landingPageWithItems.is_default,
    ...(items === undefined ? {} : { items }),
  }
}

const storyTimestamp = '2026-05-01T12:00:00.000Z'

export function accountPost(endpoint: string, body: unknown): unknown | undefined {
  if (endpoint === '/api/v1/my/import/topics') {
    return { results: topicNames(body).map(input => ({ input, status: 'followed' })) }
  }
  if (endpoint === '/api/v1/my/landing-pages') {
    return { landing_page: { ...updatedLandingPage(body), id: 'landing-page-story' } }
  }
  if (endpoint === '/api/v1/my/api-keys') {
    return {
      raw_key: 'vk_story_secret',
      api_key: {
        id: 'api-key-story',
        prefix: 'vk_story',
        type: textField(body, 'type') || 'rss',
        label: textField(body, 'label') || 'Story key',
        permissions: Array.isArray(record(body).permissions) ? record(body).permissions : [],
        created_at: storyTimestamp,
        last_used_at: null,
        revoked_at: null,
        updated_at: storyTimestamp,
      },
    }
  }
  if (endpoint === '/api/v1/auth/passkeys/registration/options') {
    return {
      options: { challenge: 'storybook-challenge', rp: { name: 'Voucha', id: 'localhost' } },
    }
  }
  if (endpoint === '/api/v1/auth/passkeys/registration/verify') {
    return {
      passkey: {
        id: 'passkey-story',
        name: textField(body, 'name') || 'Story passkey',
        device_type: 'multiDevice',
        backed_up: true,
        created_at: storyTimestamp,
        last_used_at: null,
      },
    }
  }
  if (endpoint === '/api/v1/auth/totp') {
    return {
      authenticator: {
        id: 'totp-story',
        name: textField(body, 'name') || 'Authenticator',
        created_at: storyTimestamp,
      },
      secret: 'STORYBOOKSECRET',
      uri: 'otpauth://totp/Voucha:story?secret=STORYBOOKSECRET&issuer=Voucha',
    }
  }
  if (endpoint === '/api/v1/auth/totp/setup/verification') {
    return {
      authenticator: {
        id: textField(body, 'authenticator_id') || 'totp-story',
        name: 'Authenticator',
        created_at: storyTimestamp,
      },
    }
  }
  if (endpoint === '/api/v1/images/upload-url') {
    return {
      upload: {
        image_id: 'image-story',
        upload_url: 'https://storybook.invalid/upload',
        content_type: textField(body, 'content_type') || 'image/png',
        expires_at: '2026-05-01T12:10:00.000Z',
      },
    }
  }
  if (/^\/api\/v1\/images\/[^/]+\/completions$/.test(endpoint)) {
    return { image: { id: endpoint.split('/')[4] ?? 'image-story', upload_status: 'complete' } }
  }
  if (
    endpoint === '/api/v1/auth/mfa/re-auth/totp/verification' ||
    endpoint === '/api/v1/auth/mfa/re-auth/email/verification'
  ) {
    return { re_auth_token: 'storybook-reauth' }
  }
  return undefined
}

export function accountImageState(endpoint: string): unknown | undefined {
  if (!/^\/api\/v1\/images\/[^/]+\/upload-state$/.test(endpoint)) return undefined
  return {
    upload_state: {
      id: endpoint.split('/')[4] ?? 'image-story',
      upload_status: 'complete',
      upload_error: null,
      ready: true,
      blocked: false,
    },
  }
}
