import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { reportSection } from './verify-ipv6-egress-checks.mts'
import {
  createTestUserDirect,
  insertApprovedTestFediverseInstance,
  insertTestFediverseInstanceExtension,
  insertTestFediverseInstanceIntegrationChange,
  insertTestTopic,
  insertTestUrlHostname,
  mergeTopicForTest,
  softDeleteTopic,
} from '@voucha/test-helpers'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { apiEgressProxyConfig } from '@services/api-egress-proxy'
import {
  reportApiEgressProxyConfig,
  reportApprovedFediverseInstanceHosts,
} from './verify-ipv6-egress-vpc-evidence.mts'

const ENABLED_API_EGRESS_PROXY_FIELDS = {
  stripe_enabled: true,
  openai_moderation_enabled: true,
  apple_oauth_enabled: true,
  github_oauth_enabled: true,
  x_oauth_enabled: true,
  bluesky_oauth_enabled: true,
  fediverse_search_enabled: true,
  bedrock_embeddings_enabled: true,
}

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

function readLoggedPayload(spy: ReturnType<typeof vi.spyOn>): {
  kind: string
  [key: string]: unknown
} {
  expect(spy).toHaveBeenCalledOnce()
  return JSON.parse(spy.mock.calls[0]?.[0] as string) as { kind: string }
}

describe('IPv6 egress diagnostic sections', () => {
  it('reports a successful section without an error payload', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(reportSection('example', async () => {})).resolves.toBe(true)
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('records an error payload and continues when a section fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      reportSection('example', async () => {
        throw new Error('boom')
      }),
    ).resolves.toBe(false)
    expect(error).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({ kind: 'error', section: 'example', message: 'boom' }),
    )
    error.mockRestore()
  })

  it('stringifies a non-Error thrown value', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      reportSection('example', () => Promise.reject('not an error object')),
    ).resolves.toBe(false)
    expect(readLoggedPayload(error)).toEqual({
      kind: 'error',
      section: 'example',
      message: 'not an error object',
    })
    error.mockRestore()
  })
})

describe('API egress proxy configuration evidence', () => {
  beforeAll(async () => {
    await apiEgressProxyConfig.waitForInitialization()
    apiEgressProxyConfig.unsubscribe()
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([apiEgressProxyConfig])
  })

  it('reports every provider flag when all proxy routes are enabled', async () => {
    overrideDynamicConfigFieldsForTest(apiEgressProxyConfig, ENABLED_API_EGRESS_PROXY_FIELDS)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await expect(reportApiEgressProxyConfig()).resolves.toBeUndefined()
      expect(readLoggedPayload(log)).toEqual({
        kind: 'api-egress-proxy-config',
        fields: ENABLED_API_EGRESS_PROXY_FIELDS,
      })
    } finally {
      log.mockRestore()
    }
  })

  it('rejects the evidence section when any proxy route is disabled', async () => {
    const fields = { ...ENABLED_API_EGRESS_PROXY_FIELDS, github_oauth_enabled: false }
    overrideDynamicConfigFieldsForTest(apiEgressProxyConfig, fields)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await expect(reportApiEgressProxyConfig()).rejects.toThrow(
        'API egress proxy routes are disabled: github_oauth_enabled',
      )
      expect(readLoggedPayload(log)).toEqual({ kind: 'api-egress-proxy-config', fields })
    } finally {
      log.mockRestore()
    }
  })
})

describe('approved Fediverse instance host evidence', () => {
  it('includes an approved hostname and reports the exact count', async () => {
    const hostname = `verify-ipv6-approved-${randomSuffix()}.example.com`
    await insertApprovedTestFediverseInstance(hostname)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await reportApprovedFediverseInstanceHosts()
      const payload = readLoggedPayload(log)
      expect(payload.kind).toBe('approved-fediverse-instance-hosts')
      expect(payload.hosts).toContain(hostname)
      expect(payload.count).toBe((payload.hosts as string[]).length)
    } finally {
      log.mockRestore()
    }
  })

  it('excludes a pending hostname', async () => {
    const user = await createTestUserDirect()
    const suffix = randomSuffix()
    const hostname = `verify-ipv6-pending-${suffix}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const topicId = await insertTestTopic({
      name: `Pending Fediverse Instance ${suffix}`,
      slug: `verify-ipv6-pending-${suffix}`,
      createdById: user.id,
      topicType: 'fediverse_instance',
      hostnameId,
    })
    await insertTestFediverseInstanceExtension({ topicId })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await reportApprovedFediverseInstanceHosts()
      expect(readLoggedPayload(log).hosts).not.toContain(hostname)
    } finally {
      log.mockRestore()
    }
  })

  it('excludes a soft-deleted formerly-approved hostname', async () => {
    const user = await createTestUserDirect()
    const suffix = randomSuffix()
    const hostname = `verify-ipv6-deleted-${suffix}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const topicId = await insertTestTopic({
      name: `Deleted Fediverse Instance ${suffix}`,
      slug: `verify-ipv6-deleted-${suffix}`,
      createdById: user.id,
      topicType: 'fediverse_instance',
      hostnameId,
    })
    await insertTestFediverseInstanceExtension({ topicId })
    await insertTestFediverseInstanceIntegrationChange({ topicId, integrationStatus: 'approved' })
    await softDeleteTopic(topicId, user.id)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await reportApprovedFediverseInstanceHosts()
      expect(readLoggedPayload(log).hosts).not.toContain(hostname)
    } finally {
      log.mockRestore()
    }
  })

  it('excludes a merged formerly-approved hostname', async () => {
    const user = await createTestUserDirect()
    const suffix = randomSuffix()
    const hostname = `verify-ipv6-merged-${suffix}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const topicId = await insertTestTopic({
      name: `Merged Fediverse Instance ${suffix}`,
      slug: `verify-ipv6-merged-${suffix}`,
      createdById: user.id,
      topicType: 'fediverse_instance',
      hostnameId,
    })
    await insertTestFediverseInstanceExtension({ topicId })
    await insertTestFediverseInstanceIntegrationChange({ topicId, integrationStatus: 'approved' })
    const destinationId = await insertTestTopic({
      name: `Merge destination ${suffix}`,
      slug: `verify-ipv6-merge-dest-${suffix}`,
      createdById: user.id,
    })
    await mergeTopicForTest(topicId, destinationId, user.id)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await reportApprovedFediverseInstanceHosts()
      expect(readLoggedPayload(log).hosts).not.toContain(hostname)
    } finally {
      log.mockRestore()
    }
  })
})
