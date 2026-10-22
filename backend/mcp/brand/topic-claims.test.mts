import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as dns from '@services/topic-claims/domain-verification-dns'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTopic, insertTestUrlHostname } from '@voucha/test-helpers'
import {
  callStructuredMcpTool,
  expectMcpToolFunctionThrows,
  optionArgs,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import type { PrivateUser } from '@services/users/types'
import type { TopicClaimPage } from '@services/topic-claims/get'

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

  it('paginates filtered claims with REST parity and a scoped cursor', async () => {
    const owner = await createTestUser()
    const request = await authed(owner)
    const topics = await Promise.all([topicFor(owner), topicFor(owner)])
    for (const topic of topics) {
      await request
        .post(`/api/v1/topics/${topic.id}/claims`)
        .set('Content-Type', 'application/json')
        .send({ claimed_role: 'Issuer', evidence: '' })
        .expect(201)
    }
    const args = { limit: 1, topic_ids: topics.map(topic => topic.id) }
    const first = await readTool(owner, 'list', args)
    const rest = await request
      .get('/api/v1/my/topic-claims')
      .query({ limit: 1, topic_ids: args.topic_ids.join(',') })
      .expect(200)
    expect(first).toEqual(rest.body)
    const firstPage = first as {
      results: Array<{ id: string }>
      page_info: TopicClaimPage['page_info']
    }
    expect(firstPage.page_info).toMatchObject({ has_next_page: true })
    const second = await readTool(owner, 'list', {
      ...args,
      after: firstPage.page_info.end_cursor,
    })
    const secondPage = second as { results: Array<{ id: string }> }
    expect(secondPage.results).toHaveLength(1)
    expect(secondPage.results[0]!.id).not.toBe(firstPage.results[0]!.id)
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
})
