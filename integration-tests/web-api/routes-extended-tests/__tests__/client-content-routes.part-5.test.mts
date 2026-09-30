import { describe, expect, it } from 'vitest'

import { psql as psqlQueue } from '../../../../backend/queues/psql/queues.mts'
import * as clientRoutes from '@/lib/api/client'
import { installClientContentRouteHarness } from '../../../test-helpers/client-content-route-harness.mts'

function unset(target: object, key: string) {
  delete (target as Record<string, unknown>)[key]
}

describe('client-content-routes', () => {
  const harness = installClientContentRouteHarness({ unset })

  describe('psql client routes (admin only)', () => {
    it('fetchMigrations returns 200', async () => {
      const result = await harness.withClientRuntime(
        () => clientRoutes.fetchMigrations(),
        harness.adminCookieHeader,
      )
      expect(result).toMatchObject({
        applied: expect.any(Array),
        pending: expect.any(Array),
        total: expect.any(Number),
      })
      // total is the on-disk migration file count; applied + pending must partition it exactly.
      // A broken endpoint returning {applied:[],pending:[],total:0} would satisfy both checks
      // above, even though this repository always has migration files on disk — require a
      // positive total and that this repo's first migration (guaranteed applied, since every
      // later migration depends on it) is actually present in the response.
      expect(result.total).toBe(result.applied.length + result.pending.length)
      expect(result.total).toBeGreaterThan(0)
      expect(result.applied).toContain('0000-00-00-core-functions-sites.sql')
    })

    it('fetchPartitions returns 200', async () => {
      const result = await harness.withClientRuntime(
        () => clientRoutes.fetchPartitions(),
        harness.adminCookieHeader,
      )
      expect(result).toMatchObject({ tables: expect.any(Array) })
      // {tables:[]} satisfies the shape check above even though the migrated test database
      // always has multiple partitioned tables — require a nonempty list that includes a
      // stable known parent table with an actual partition, so a regression that drops the
      // catalog rows is distinguishable from success.
      expect(result.tables.length).toBeGreaterThan(0)
      const sessionReferralAttributions = result.tables.find(
        table => table.name === 'session_referral_attributions',
      )
      expect(sessionReferralAttributions).toBeDefined()
      expect(sessionReferralAttributions!.partition_count).toBeGreaterThan(0)
    })

    it('enqueuePsqlJob runViews returns 200 and actually enqueues the job', async () => {
      // The route returns {success:true} unconditionally, whether or not
      // enqueueRunViews() actually ran — reading the queue directly is what proves a
      // job was really dispatched, not just that the route didn't throw. Diff against
      // a snapshot of existing job ids (rather than asserting on an empty-before state)
      // so this is unaffected by jobs left over from other test runs. A priority job with
      // no explicit delay lands directly in the waiting priority list, not the delayed
      // ZSet (that's reserved for jobs with a future runAt).
      const beforeIds = new Set(
        (await psqlQueue.getJobs('waiting', 0, -1, { excludeData: true })).map(job => job.id),
      )

      const result = await harness.withClientRuntime(
        () => clientRoutes.enqueuePsqlJob('runViews'),
        harness.adminCookieHeader,
      )
      expect(result).toMatchObject({ success: true })

      const afterJobs = await psqlQueue.getJobs('waiting', 0, -1, { excludeData: true })
      const newRunViewsJob = afterJobs.find(
        job => !beforeIds.has(job.id) && job.name === 'runViews',
      )
      expect(newRunViewsJob).toBeDefined()
    })
  })

  describe('valkey client routes (admin only)', () => {
    it('fetchCacheGroups returns 200', async () => {
      // {groups:[]} satisfies `expect.any(Array)` even though CACHE_GROUPS
      // (backend/services/valkey-admin/flush-targets.mts) always registers a fixed set of
      // groups — require the stable 'rss' group (with its declared prefixes) to actually be
      // present, so a regression that empties or breaks the registry is distinguishable from
      // success.
      const result = await harness.withClientRuntime(
        () => clientRoutes.fetchCacheGroups(),
        harness.adminCookieHeader,
      )
      const rssGroup = result.groups.find(group => group.name === 'rss')
      expect(rssGroup).toBeDefined()
      expect(rssGroup!.prefixes).toEqual(
        expect.arrayContaining(['rss_feeds', 'rss_feed_items', 'rss_feed_item_elections']),
      )
    })
  })

  describe('dynamic config client routes (admin only)', () => {
    it('fetchDynamicConfigNamespaces returns 200', async () => {
      // {namespaces:[]} satisfies `expect.any(Array)` even though the dynamic-config registry
      // (backend/services/dynamic-config-admin/registry-core-entries.mts) always registers
      // 'feature-flags', unconditionally viewable by an administrator — require it to actually
      // be present, so a regression that empties or breaks the registry is distinguishable
      // from success.
      const result = await harness.withClientRuntime(
        () => clientRoutes.fetchDynamicConfigNamespaces(),
        harness.adminCookieHeader,
      )
      const featureFlagsNamespace = result.namespaces.find(
        namespace => namespace.namespace === 'feature-flags',
      )
      expect(featureFlagsNamespace).toBeDefined()
      expect(featureFlagsNamespace!.can_view).toBe(true)
    })
  })
})
