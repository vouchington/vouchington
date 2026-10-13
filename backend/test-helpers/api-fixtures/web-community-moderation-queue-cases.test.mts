import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { validateResponseContract } from './contract-schema.mts'
import type { ApiFixtureManifest } from './types.mts'

const fixtureRoot = new URL('../../../api-fixtures/v1/', import.meta.url)
const manifest = JSON.parse(
  readFileSync(new URL('manifest.json', fixtureRoot), 'utf8'),
) as ApiFixtureManifest
const queueContract =
  manifest.backendResponseContracts['GET:/api/v1/communities/:communitySlug/moderation-queue']!
const dismissalContract =
  manifest.backendResponseContracts[
    'POST:/api/v1/communities/:idOrSlug/posts/:postId/automod-flag/dismissal'
  ]!

function response(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`responses/${id}.json`, fixtureRoot), 'utf8')) as Record<
    string,
    unknown
  >
}

describe('native community automod response contracts', () => {
  it('accepts the source-filtered flag pages and member empty state', () => {
    const first = response('native.communities.moderation-queue.automod-flag.page-1')
    const second = response('native.communities.moderation-queue.automod-flag.page-2')
    const member = response('native.communities.moderation-queue.automod-flag.member')

    for (const body of [first, second, member]) {
      expect(validateResponseContract(queueContract.schema, body)).toEqual([])
    }

    const firstCursor = (first.page_info as { end_cursor: string }).end_cursor
    expect(JSON.parse(Buffer.from(firstCursor, 'base64url').toString('utf8'))).toEqual({
      created_at: '2026-01-01T00:00:00.000000Z',
      id: (first.entries as Record<string, unknown>[])[0]!.id,
    })
    const pageTwoFixture = manifest.fixtures.find(
      fixture => fixture.id === 'native.communities.moderation-queue.automod-flag.page-2',
    )!
    expect(pageTwoFixture.query?.after).toBe(firstCursor)
    expect(member).toMatchObject({ entries: [], viewer_tier: 'member' })
  })

  it('preserves required report fields and reason while flag fields remain nullable', () => {
    const report = response('web.communities.moderation-queue.default')
    const flag = response('native.communities.moderation-queue.automod-flag.page-1')
    expect(validateResponseContract(queueContract.schema, report)).toEqual([])
    expect((flag.entries as Record<string, unknown>[])[0]).toMatchObject({
      queue_source: 'automod_flag',
      reason: null,
    })

    const invalidReport = structuredClone(report)
    const entry = (invalidReport.entries as Record<string, unknown>[])[0]!
    delete entry.case_id
    entry.reason = null
    expect(validateResponseContract(queueContract.schema, invalidReport)).not.toEqual([])
  })

  it('declares a no-content dismissal operation and validates its null body', () => {
    const dismissal = manifest.fixtures.find(
      fixture => fixture.id === 'native.communities.automod-flag.dismissal.default',
    )!
    expect(dismissal).toMatchObject({ status: 204, method: 'POST' })
    expect(dismissalContract).toMatchObject({
      bodyKind: 'none',
      statusCodes: [204],
      statusKnowledge: 'explicit',
    })
    const body = JSON.parse(
      readFileSync(
        new URL('responses/native.communities.automod-flag.dismissal.default.json', fixtureRoot),
        'utf8',
      ),
    ) as unknown
    expect(body).toBeNull()
    expect(validateResponseContract(dismissalContract.schema, body)).toEqual([])
  })
})
