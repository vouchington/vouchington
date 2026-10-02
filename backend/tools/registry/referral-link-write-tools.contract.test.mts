import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createReferralProgramFixture } from '@voucha/test-helpers/entities/referral-programs'
import {
  createTestMembership,
  createTestUser,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'
import { getTopicBySlug } from '@services/topics/get'
import { getUserReferralLink, type UserReferralLink } from '@services/user-referral-program-links'
import { addUserRole } from '@services/users/roles-permissions'
import deleteReferralLinkTool from '../delete-referral-link.mts'
import updateReferralLinkTool from '../update-referral-link.mts'
import { getRegisteredToolByName } from './index.mts'

const SCOPES = ['referral-links:read', 'referral-links:write'] as const

type Caller = Awaited<ReturnType<typeof createCaller>>
type LinkResult = { referral_link: UserReferralLink }

async function createCaller(plan: 'plus' | null = 'plus') {
  return { ...(await createTestUser()), membership_plan: plan }
}

/**
 * The refusal the tool throws itself. The call path reduces a thrown error to one generic failure
 * text, so the status and message are asserted on the tool function and the refusal on the call.
 */
const expectToolThrows = (
  caller: Caller,
  name: string,
  args: Record<string, unknown>,
  expected: { status?: number; message?: string; code?: string },
) => expect(getRegisteredToolByName(name)!.function(caller)(args)).rejects.toMatchObject(expected)

const unique = () => crypto.randomUUID().slice(0, 8)

/** Valid arguments for every tool that acts on an existing link. */
const linkCalls = (id: string) =>
  [
    ['update_referral_link', { link_id: id, label: 'Changed' }],
    ['delete_referral_link', { link_id: id }],
    ['activate_referral_link', { link_id: id }],
    ['deactivate_referral_link', { link_id: id }],
    ['request_referral_link_unfurl', { link_id: id }],
  ] as const

describe('referral link write tools contract — real DB', () => {
  const suspendedUserIds: string[] = []
  let referralProgramId: string
  let hostname: string

  beforeAll(async () => {
    const fixture = await createReferralProgramFixture({ createdById: (await createCaller()).id })
    referralProgramId = fixture.referralProgramId
    hostname = fixture.hostname
  })

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  const linkUrl = () => `https://${hostname}/ref/${unique()}`
  const createArgs = (extra: Record<string, unknown> = {}) => ({
    referral_program_id: referralProgramId,
    url: linkUrl(),
    ...extra,
  })

  async function createLink(caller: Caller, extra: Record<string, unknown> = {}) {
    const result = await callStructuredMcpTool(
      caller,
      'create_referral_link',
      createArgs(extra),
      SCOPES,
    )
    return (result as LinkResult).referral_link
  }

  it('create_referral_link returns the link the REST route creates, owned by the caller', async () => {
    const caller = await createCaller()
    const request = createRequest()
    await request.authenticateAs(caller)
    const rest = await request
      .post('/api/v1/referral-links')
      .set('Content-Type', 'application/json')
      .send(createArgs({ label: 'REST' }))
      .expect(201)

    const link = await createLink(caller, { label: 'Tool' })

    expect(Object.keys(link).toSorted()).toEqual(Object.keys(rest.body.referral_link).toSorted())
    expect(link).toMatchObject({ user_id: caller.id, label: 'Tool', deactivated_at: null })
    expect(link.activated_at).toEqual(expect.any(String))
  })

  it('create_referral_link reactivates a deactivated link and keeps its label unless one is sent', async () => {
    const caller = await createCaller()
    const url = linkUrl()
    const args = { referral_program_id: referralProgramId, url }
    const first = await createLink(caller, { url, label: 'Kept' })
    await callStructuredMcpTool(caller, 'deactivate_referral_link', { link_id: first.id }, SCOPES)

    const again = await callStructuredMcpTool(caller, 'create_referral_link', args, SCOPES)

    expect((again as LinkResult).referral_link).toMatchObject({
      id: first.id,
      label: 'Kept',
      deactivated_at: null,
    })
  })

  it('update_referral_link changes the label and clears it with null', async () => {
    const caller = await createCaller()
    const { id } = await createLink(caller, { label: 'Before' })

    const renamed = await callStructuredMcpTool(
      caller,
      'update_referral_link',
      { link_id: id, label: 'After' },
      SCOPES,
    )
    const cleared = await callStructuredMcpTool(
      caller,
      'update_referral_link',
      { link_id: id, label: null },
      SCOPES,
    )

    expect((renamed as LinkResult).referral_link).toMatchObject({ id, label: 'After' })
    expect((cleared as LinkResult).referral_link).toMatchObject({ id, label: null })
  })

  it('deactivate_referral_link and activate_referral_link toggle the link', async () => {
    const caller = await createCaller()
    const { id } = await createLink(caller)
    const call = (name: string) => callStructuredMcpTool(caller, name, { link_id: id }, SCOPES)

    const off = (await call('deactivate_referral_link')) as LinkResult
    const on = (await call('activate_referral_link')) as LinkResult

    expect(off.referral_link).toMatchObject({ id, deactivated_at: expect.any(String) })
    expect(on.referral_link).toMatchObject({ id, deactivated_at: null })
    expect(on.referral_link.activated_at).toEqual(expect.any(String))
  })

  it('delete_referral_link removes the link, and deleting it again is refused as not found', async () => {
    const caller = await createCaller()
    const { id } = await createLink(caller)

    expect(
      await callStructuredMcpTool(caller, 'delete_referral_link', { link_id: id }, SCOPES),
    ).toEqual({ success: true })

    expect(await getUserReferralLink(id)).toBeNull()
    await expect(deleteReferralLinkTool.function(caller)({ link_id: id })).rejects.toMatchObject({
      status: 404,
    })
  })

  it('never lets one user change another user’s link, and a missing link is not found', async () => {
    const caller = await createCaller()
    const owner = await createCaller()
    const { id } = await createLink(owner, { label: 'Owner link' })

    for (const [name, args] of linkCalls(id)) {
      await callRejectedMcpTool(caller, name, args, SCOPES)
      await expectToolThrows(caller, name, args, { status: 403 })
    }
    await expect(
      updateReferralLinkTool.function(caller)({ link_id: crypto.randomUUID(), label: 'x' }),
    ).rejects.toMatchObject({ status: 404 })

    expect(await getUserReferralLink(id)).toMatchObject({
      label: 'Owner link',
      deactivated_at: null,
    })
  })

  it('keeps the REST policy: an administrator is an official account that cannot create or edit a link but may switch or delete another user’s', async () => {
    const admin = await createCaller()
    await addUserRole(admin.id, 'administrator')
    const owner = await createCaller()
    const { id } = await createLink(owner, { label: 'Owner link' })
    const official = { status: 403, code: OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN }

    await expectToolThrows(admin, 'create_referral_link', createArgs(), official)
    await expectToolThrows(
      admin,
      'update_referral_link',
      { link_id: id, label: 'Staff label' },
      official,
    )
    const call = (name: string) => callStructuredMcpTool(admin, name, { link_id: id }, SCOPES)
    const off = (await call('deactivate_referral_link')) as LinkResult
    const on = (await call('activate_referral_link')) as LinkResult
    expect(off.referral_link.deactivated_at).toEqual(expect.any(String))
    expect(on.referral_link).toMatchObject({ id, label: 'Owner link', deactivated_at: null })

    expect(await call('delete_referral_link')).toEqual({ success: true })
    expect(await getUserReferralLink(id)).toBeNull()
  })

  it('request_referral_link_unfurl marks the Amex link of a paid owner as requested', async () => {
    const caller = await createCaller()
    await createTestMembership({ user_id: caller.id, plan: 'plus' })
    const amex = await getTopicBySlug('amex-referral-program')
    const url = `https://www.americanexpress.com/en-us/referral/all-cards?ref=${unique()}`
    const { id } = await createLink(caller, { referral_program_id: amex!.id, url })

    const result = await callStructuredMcpTool(
      caller,
      'request_referral_link_unfurl',
      { link_id: id },
      SCOPES,
    )

    expect((result as LinkResult).referral_link).toMatchObject({
      id,
      unfurl_requested_at: expect.any(String),
    })
    expect((await getUserReferralLink(id))?.unfurl_requested_at).toBeTruthy()
  })

  it('request_referral_link_unfurl refuses a link outside the Amex all-cards program', async () => {
    const caller = await createCaller()
    const { id } = await createLink(caller)

    await callRejectedMcpTool(caller, 'request_referral_link_unfurl', { link_id: id }, SCOPES)
    await expectToolThrows(
      caller,
      'request_referral_link_unfurl',
      { link_id: id },
      { message: 'Only Amex all-cards referral links can be unfurled' },
    )
    expect((await getUserReferralLink(id))?.unfurl_requested_at).toBeNull()
  })

  it('refuses a read-only scope grant and a free plan on every referral link tool', async () => {
    const caller = await createCaller()
    const free = await createCaller(null)
    const { id } = await createLink(caller, { label: 'Guarded' })
    const calls = [['create_referral_link', createArgs()], ...linkCalls(id)] as const

    for (const [name, args] of calls) {
      expect(await callRejectedMcpTool(caller, name, args, ['referral-links:read'])).toContain(
        'Tool requires scopes referral-links:read, referral-links:write',
      )
      expect(await callRejectedMcpTool(free, name, args, SCOPES)).toContain(
        'requires a higher plan',
      )
    }

    expect(await getUserReferralLink(id)).toMatchObject({ label: 'Guarded', deactivated_at: null })
  })

  it('refuses a suspended user before any change', async () => {
    const caller = await createCaller()
    const { id } = await createLink(caller, { label: 'Frozen' })
    await suspendTestUser(caller.id)
    suspendedUserIds.push(caller.id)
    const calls = [['create_referral_link', createArgs()], ...linkCalls(id)] as const

    for (const [name, args] of calls) {
      await callRejectedMcpTool(caller, name, args, SCOPES)
      await expectToolThrows(caller, name, args, {
        status: 403,
        message: 'Your account has been suspended',
      })
    }

    expect(await getUserReferralLink(id)).toMatchObject({ label: 'Frozen', deactivated_at: null })
  })

  const validCreate = { referral_program_id: crypto.randomUUID(), url: 'https://e.com/' }
  it.each([
    ['create_referral_link', {}],
    ['create_referral_link', { referral_program_id: 'nope', url: 'https://example.com/x' }],
    ['create_referral_link', { referral_program_id: crypto.randomUUID(), url: '' }],
    ['create_referral_link', { ...validCreate, x: 1 }],
    ['create_referral_link', { ...validCreate, user_id: crypto.randomUUID() }],
    ['update_referral_link', { link_id: 'nope', label: 'x' }],
    ['update_referral_link', { link_id: crypto.randomUUID(), label: 7 }],
    ['delete_referral_link', {}],
    ['activate_referral_link', { link_id: 'nope' }],
    ['deactivate_referral_link', { link_id: crypto.randomUUID(), force: true }],
    ['request_referral_link_unfurl', { link_id: 'nope' }],
  ])('refuses invalid %s arguments before any change', async (name, args) => {
    const caller = await createCaller()

    expect(await callRejectedMcpTool(caller, name, args, SCOPES)).toContain(
      'Invalid tool arguments',
    )
  })
})
