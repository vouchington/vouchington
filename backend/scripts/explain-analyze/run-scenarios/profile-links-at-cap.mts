import assert from 'node:assert/strict'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { listProfileLinks } from '../run-services.mts'
import {
  PROFILE_LINK_CAPACITY_OWNER,
  profileLinkCapacityPlacements,
  profileLinkCapacityRows,
} from '../seed-data/profile-links-at-cap.mts'

export async function runProfileLinksAtCapacityScenario(): Promise<void> {
  const scenario = 'profile-links-at-cap'
  const queryName = 'listProfileLinks'
  registerScenarioContract(scenario, {
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'user_profile_links',
        max: profileLinkCapacityRows.length,
      },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const links = await listProfileLinks(PROFILE_LINK_CAPACITY_OWNER)
      assert.deepEqual(
        links.map(({ id, sort_order, link_type, url_id, handle }) => ({
          id,
          sort_order,
          link_type,
          url_id,
          handle,
        })),
        profileLinkCapacityRows,
      )
      assert.equal(links[0]?.url, 'https://seed-host-0.example.com/feed/0')
      assert.equal(links[1]?.url, null)
      assert.deepEqual(
        links.map(link => link.image_placement),
        profileLinkCapacityRows.map((_, index) => profileLinkCapacityPlacements[index] ?? null),
      )
    },
    'at-cap',
    queryName,
    { exactCapturedNames: [queryName] },
  )
}
