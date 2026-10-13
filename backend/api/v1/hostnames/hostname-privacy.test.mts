import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityListItem,
} from '@voucha/test-helpers'
import { resolveEmailDomainHostnameId } from '../../../services/email-address-validator/email-domain-context.mts'
import { addCommunityListItem } from '../../../services/communities/list-items/add.mts'
import { upsertUrlHostnames } from '../../../services/urls-hostnames/upsert.mts'

describe('hostname public provenance', () => {
  it('hides an email-only hostname from public readers while staff can search it', async () => {
    const domain = `private-email-${crypto.randomUUID()}.example.com`
    const hostnameId = await resolveEmailDomainHostnameId(`owner@${domain}`)
    if (!hostnameId) throw new Error('Expected email domain hostname')
    const member = await createTestUser()
    const admin = await createTestUser({ administrator: true })

    const anonymous = await createRequest().get(`/api/v1/hostnames?query=${domain}`).expect(200)
    expect(anonymous.body.results).toEqual([])
    await createRequest().get(`/api/v1/hostnames/${hostnameId}`).expect(404)
    const compared = await createRequest()
      .get(`/api/v1/hostnames/compare?ids=${hostnameId}`)
      .expect(200)
    expect(compared.body.hostnames).toEqual({})

    const memberRequest = createRequest()
    await memberRequest.authenticateAs(member)
    const memberResults = await memberRequest.get(`/api/v1/hostnames?query=${domain}`).expect(200)
    expect(memberResults.body.results).toEqual([])
    const memberSearch = await memberRequest.get(`/api/v1/search?q=${domain}`).expect(200)
    expect(memberSearch.body.domains).toEqual([])

    const adminRequest = createRequest()
    await adminRequest.authenticateAs(admin)
    const staffResults = await adminRequest.get(`/api/v1/hostnames?query=${domain}`).expect(200)
    expect(staffResults.body.results).toContainEqual({ __entity_type: 'hostname', id: hostnameId })
    await adminRequest.get(`/api/v1/hostnames/${hostnameId}`).expect(200)
    const staffSearch = await adminRequest.get(`/api/v1/search?q=${domain}`).expect(200)
    expect(staffSearch.body.domains).toContainEqual({ id: hostnameId, hostname: domain })
  })

  it('omits private hostnames from a public community domain page and count', async () => {
    const owner = await createTestUser()
    const suffix = crypto.randomUUID()
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Hostname privacy ${suffix}`,
      slug: `hostname-privacy-${suffix}`,
    })
    const privateId = await resolveEmailDomainHostnameId(`owner@private-${suffix}.example.com`)
    const publicDomain = `public-${suffix}.example.com`
    const publicId = (await upsertUrlHostnames(owner.id, [publicDomain])).get(publicDomain)
    if (!privateId || !publicId) throw new Error('Expected test hostnames')
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'url_hostname',
      entityId: privateId,
    })
    await addCommunityListItem(owner.id, community.id, 'url_hostname', publicId)

    const items = await createRequest()
      .get(`/api/v1/communities/${community.slug}/list-items/domains`)
      .expect(200)
    expect(Object.keys(items.body.url_hostnames)).toEqual([publicId])
    const counts = await createRequest()
      .get(`/api/v1/communities/${community.slug}/list-items/counts`)
      .expect(200)
    expect(counts.body.url_hostname).toBe(1)
  })
})
