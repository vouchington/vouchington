import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as dns from '@services/topic-claims/domain-verification-dns'
import { planMcpCalls } from '@services/mcp-tools'
import { BRAND_MCP_SERVER_CONFIG } from '@services/mcp-tools/config'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTopic, insertTestUrlHostname } from '@voucha/test-helpers'
import {
  callStructuredMcpTool,
  expectMcpToolFunctionThrows,
  optionArgs,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import type { PrivateUser } from '@services/users/types'

const READ = ['topic-claims:read'] as const
const WRITE = ['topic-claims:read', 'topic-claims:write'] as const
const caller = (user: PrivateUser): McpContractCaller => ({ ...user, membership_plan: null })

function readTool(user: PrivateUser, option: string, args: Record<string, unknown> = {}) {
  return callStructuredMcpTool(caller(user), 'read_my_topic_claims', optionArgs(option, args), READ)
}

function writeTool(user: PrivateUser, option: string, args: Record<string, unknown>) {
  return callStructuredMcpTool(caller(user), 'manage_topic_claim', optionArgs(option, args), WRITE)
}

async function topicFor(user: PrivateUser, hostname = false) {
  const suffix = crypto.randomUUID().slice(0, 8)
  const hostnameId = hostname
    ? await insertTestUrlHostname({ hostname: `brand-${suffix}.example.com` })
    : undefined
  const slug = `brand-topic-${suffix}`
  const id = await insertTestTopic({
    name: `Brand Topic ${suffix}`,
    slug,
    createdById: user.id,
    ...(hostnameId ? { hostnameId } : {}),
  })
  return { id, slug }
}

function authed(user: PrivateUser) {
  const request = createRequest()
  return request.authenticateAs(user).then(() => request)
}

describe('brand topic-claim MCP tools', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('lists and reads the caller’s claims the same way REST does', async () => {
    const owner = await createTestUser()
    const other = await createTestUser()
    const staff = await createTestUser({ administrator: true })
    const topic = await topicFor(owner)
    const request = await authed(owner)
    const created = await request
      .post(`/api/v1/topics/${topic.slug}/claims`)
      .set('Content-Type', 'application/json')
      .send({ claimed_role: 'Issuer', evidence: 'owned' })
      .expect(201)
    const claimId = created.body.claim.id as string

    expect(await readTool(owner, 'list')).toEqual(
      (await request.get('/api/v1/my/topic-claims').expect(200)).body,
    )
    const single = await request.get(`/api/v1/topics/${topic.slug}/claims/${claimId}`).expect(200)
    expect(await readTool(owner, 'get', { topic: topic.slug, claim_id: claimId })).toEqual(
      single.body,
    )
    expect(await readTool(staff, 'get', { topic: topic.id, claim_id: claimId })).toEqual(
      single.body,
    )
    await expectMcpToolFunctionThrows(
      caller(other),
      'read_my_topic_claims',
      optionArgs('get', { topic: topic.slug, claim_id: claimId }),
      { status: 404, message: 'Claim not found' },
    )
  })

  it('files, verifies, and refuses to overwrite a verified claim', async () => {
    const owner = await createTestUser()
    const topic = await topicFor(owner, true)
    const request = await authed(owner)
    const filed = await writeTool(owner, 'create', {
      topic: topic.slug,
      claimed_role: 'Issuer',
      evidence: 'first',
    })
    const claimId = (filed.claim as { id: string }).id
    expect(filed.isDuplicate).toBe(false)
    expect({ claim: filed.claim }).toEqual(
      (await request.get(`/api/v1/topics/${topic.slug}/claims/${claimId}`).expect(200)).body,
    )

    const token = await writeTool(owner, 'issue_verification_token', {
      topic: topic.slug,
      claim_id: claimId,
    })
    const restToken = await request
      .post(`/api/v1/topics/${topic.slug}/claims/${claimId}/verification-token`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(200)
    const hostname = (token.dnsInstructions as { hostname: string }).hostname
    expect(hostname).toBe(restToken.body.dnsInstructions.hostname)
    expect(hostname.startsWith('_voucha-verification.')).toBe(true)
    vi.spyOn(dns, 'resolveTxtRecords').mockResolvedValue([restToken.body.rawToken])
    vi.spyOn(dns, 'fetchWellKnownToken').mockResolvedValue(null)

    const verified = await writeTool(owner, 'verify_domain', {
      topic: topic.slug,
      claim_id: claimId,
    })
    expect(dns.resolveTxtRecords).toHaveBeenCalledWith(hostname)
    expect(verified).toEqual(
      (await request.get(`/api/v1/topics/${topic.slug}/claims/${claimId}`).expect(200)).body,
    )

    const duplicate = await writeTool(owner, 'create', {
      topic: topic.slug,
      claimed_role: 'Other',
      evidence: 'second',
    })
    const restDuplicate = await request
      .post(`/api/v1/topics/${topic.slug}/claims`)
      .set('Content-Type', 'application/json')
      .send({ claimed_role: 'Other', evidence: 'second' })
      .expect(200)
    expect(duplicate).toEqual(restDuplicate.body)
    expect(duplicate.isDuplicate).toBe(true)
    expect(duplicate.claim).toMatchObject({
      claimed_role: 'Issuer',
      evidence: 'first',
      state: 'verified',
    })
  })

  it('submits evidence for staff review without granting ownership', async () => {
    const owner = await createTestUser()
    const topic = await topicFor(owner)
    const request = await authed(owner)
    const filed = await writeTool(owner, 'create', { topic: topic.slug, claimed_role: 'Issuer' })
    const claimId = (filed.claim as { id: string }).id
    const submitted = await writeTool(owner, 'submit_manual_review', {
      topic: topic.slug,
      claim_id: claimId,
      evidence: 'registry filing',
    })
    expect(submitted).toEqual(
      (await request.get(`/api/v1/topics/${topic.slug}/claims/${claimId}`).expect(200)).body,
    )
    expect(submitted.claim).toMatchObject({
      state: 'pending',
      evidence: 'registry filing',
      verified_at: null,
    })
  })

  it('refuses a credential that lacks topic-claim scopes', () => {
    const user = {
      id: '00000000-0000-4000-8000-000000000001',
      roles: [] as const,
      membership_plan: null,
    }
    const call = (name: string, option: string, args: Record<string, unknown>) =>
      planMcpCalls(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: optionArgs(option, args) },
        },
        user,
        [],
        BRAND_MCP_SERVER_CONFIG,
      )
    expect(call('read_my_topic_claims', 'list', {}).events[0]?.outcome).toBe('insufficient_scope')
    expect(
      call('manage_topic_claim', 'create', { topic: 'topic', claimed_role: 'Issuer' }).events[0]
        ?.outcome,
    ).toBe('insufficient_scope')
  })
})
