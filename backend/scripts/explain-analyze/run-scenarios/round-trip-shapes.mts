import { beginTransaction, read } from '@data-stores/psql'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { loadCommunityWithViewer } from '@services/communities/load-with-viewer'
import { getPendingCopyrightStaffCases } from '@services/copyright-notices/read-models-staff-case'
import { currentUserCanMessageUsers } from '@services/messaging/message-eligibility'
import {
  getBlocklistedDomainKeys,
  getFullHostnamePolicies,
  getHostnamePolicyGroups,
  getLocalHostnamePolicies,
} from '@services/urls-hostnames/policies'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

// The community and viewer membership come back in one statement, by slug and by id.
async function runCommunityWithViewer(): Promise<void> {
  registerScenarioContract('community-with-viewer', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'communities', max: 10 },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 20 },
    ],
  })
  await runAndCapture(
    'community-with-viewer',
    async () => {
      const bySlug = await loadCommunityWithViewer('seed-community-0', seedUser.id, undefined, {
        includePendingApplication: true,
      })
      if (!bySlug.membership) throw new Error('Seeded owner must be an active member')
      await loadCommunityWithViewer(bySlug.community.id, seedUser.id)
    },
    undefined,
    ['getCommunityWithViewerBySlug', 'getCommunityWithViewerById'],
  )
}

// One batched read per hostname set, probing 20,000 seeded blocklist rows by key.
async function runHostnamePolicies(): Promise<void> {
  registerScenarioContract('hostname-policies-batch', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['blocklisted_domains_pkey'],
        queryContains: 'getFullHostnamePolicies',
      },
      {
        kind: 'usesIndexes',
        indexes: ['blocklisted_domains_pkey'],
        queryContains: 'getBlocklistedDomainKeys',
      },
      { kind: 'maxProcessedRows', relation: 'blocklisted_domains', max: 500 },
    ],
  })
  const hostnames = [
    ...Array.from({ length: 10 }, (_, i) => `www.seed-host-${i}.example.com`),
    ...Array.from({ length: 5 }, (_, i) => `seed-flags-${i}.example.com`),
    ...Array.from({ length: 10 }, (_, i) => `www.seed-blocked-${i * 1_000}.example.net`),
  ]
  await runAndCapture(
    'hostname-policies-batch',
    async () => {
      const groups = getHostnamePolicyGroups(hostnames)
      const local = await getLocalHostnamePolicies(groups)
      const full = await getFullHostnamePolicies(groups)
      const keys = await getBlocklistedDomainKeys(groups)
      if (local.size !== groups.length || full.size !== groups.length)
        throw new Error('Every hostname group must get a policy')
      if (keys.size !== 10) throw new Error('Ten seeded blocklisted domains must match')
    },
    undefined,
    ['getLocalHostnamePolicies', 'getFullHostnamePolicies', 'getBlocklistedDomainKeys'],
  )
}

// One set-based relation read for a group message, one recipient per audience in rotation.
async function runMessagingEligibility(): Promise<void> {
  registerScenarioContract('messaging-eligibility-batch', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'relation__user__follow__user', max: 200 },
      { kind: 'maxProcessedRows', relation: 'relation__user__block__user', max: 200 },
      { kind: 'maxProcessedRows', relation: 'relation__user__mute__user', max: 200 },
    ],
  })
  const audiences = ['everyone', 'users', 'followers', 'mutual_followers']
  const recipients = Array.from({ length: 12 }, (_, i) => ({
    id: seedUuid(i + 1, '01'),
    direct_messages_audience: audiences[i % audiences.length] ?? 'everyone',
  }))
  await runAndCapture(
    'messaging-eligibility-batch',
    () => currentUserCanMessageUsers(seedUser.id, recipients),
    undefined,
    'currentUserCanMessageUsers',
  )
}

// The staff queue page loads every listed notice's sections with one statement per section. The
// fixture is the development seed's notices, which fill only the notice and target sections:
// the harness rejects a plan that returns no rows, so the other section statements are not
// captured here.
async function runCopyrightStaffCases(): Promise<void> {
  const { rows } = await read<{ id: string }>(
    `/* findCopyrightStaffCaseBatchNotices */ SELECT id FROM copyright_notices ORDER BY id LIMIT 25`,
  )
  if (rows.length === 0)
    throw new Error(
      'The copyright staff case scenario needs the development seed notices; run backend/scripts/seeds/dev-seed.mts before the EXPLAIN seed',
    )
  registerScenarioContract('copyright-staff-case-batch', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'copyright_notices', max: 100 }],
  })
  await runAndCapture(
    'copyright-staff-case-batch',
    async () => {
      await using transaction = await beginTransaction()
      await getPendingCopyrightStaffCases(
        rows.map(row => row.id),
        transaction,
      )
      await transaction.rollback()
    },
    undefined,
    ['getPendingCopyrightStaffCase:notice', 'getPendingCopyrightStaffCase:targets'],
  )
}

// Read first: a seeded user agent costs one lookup in the unique index. The miss path (read,
// insert, read) returns no rows in a rolled-back replay, which the harness rejects, so only the
// hit is captured.
async function runUserAgentReadFirst(): Promise<void> {
  registerScenarioContract('user-agent-read-first', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['uq_user_agent_strings__user_agent'] },
      { kind: 'maxProcessedRows', relation: 'user_agent_strings', max: 5 },
    ],
  })
  await runAndCapture(
    'user-agent-read-first',
    async () => {
      const id = await upsertUserAgentString('seed-explain-agent/42')
      if (!id) throw new Error('The seeded user agent needs an id')
    },
    undefined,
    'upsertUserAgentString',
  )
}

export async function runRoundTripShapeScenarios(): Promise<void> {
  await runCommunityWithViewer()
  await runHostnamePolicies()
  await runMessagingEligibility()
  await runCopyrightStaffCases()
  await runUserAgentReadFirst()
}
