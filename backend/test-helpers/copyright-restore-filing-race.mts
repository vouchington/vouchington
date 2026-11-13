import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import { appendCopyrightGuestFiling } from '../services/copyright-notices/guest-filings.mts'
import { finalizeCopyrightActionAfterDelivery } from '../services/copyright-notices/action-delivery-finalization.mts'
import { observeTestPostgresClientQueries } from './postgres-query-pool-observer.mts'
import {
  readDeliveryContractState,
  terminalDeliveryState,
} from './copyright-action-delivery-contract-state.mts'
import { actionDeliveryOwner } from './copyright-action-delivery-authority-subject.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import { effectiveReviewConflict } from './copyright-effective-review-outcomes.mts'
import type {
  ActionDeliveryScene,
  prepareActionDeliveryRestore,
} from './copyright-action-delivery-contract-fixtures.mts'

type Prepared = Awaited<ReturnType<typeof prepareActionDeliveryRestore>>

async function readRestoreFilingRace(scene: ActionDeliveryScene) {
  const legal = await readDeliveryContractState(actionDeliveryOwner(scene))
  const { rows } = await write<{
    id: string
    kind: string
    received: Date
    source: string
    actor: string | null
    capability: string | null
    body: string
    urgent: Date | null
    targets: string[]
  }>(sql`/* readRestoreFilingRace */
    SELECT submission.id, submission.kind, submission.received_at AS received, submission.source_kind AS source,
      submission.submitted_by_id AS actor, submission.copyright_notice_guest_capability_id AS capability,
      submission.body_ciphertext AS body, urgent.classified_at AS urgent,
      ARRAY(SELECT copyright_notice_target_id::text FROM copyright_notice_submission_targets
        WHERE copyright_notice_submission_id = submission.id ORDER BY copyright_notice_target_id) AS targets
    FROM copyright_notice_submissions submission LEFT JOIN copyright_notice_urgent_filings urgent
      ON urgent.copyright_notice_submission_id = submission.id
    WHERE submission.copyright_notice_id = ${scene.notice.id} AND submission.kind = 'court_or_ccb_hold' ORDER BY submission.id`)
  return {
    legal,
    filings: rows.map(row => ({
      ...row,
      body: decryptSecret(row.body, copyrightSubmissionPurpose(row.id)),
    })),
  }
}

/** Natural same-work-item competition; waiting for both DML checkpoints would itself deadlock. */
export async function assertRestoreCompletionAndFiling(
  scene: ActionDeliveryScene,
  prepared: Prepared,
  capability: { id: string; token: string },
  filedAt: Date,
) {
  const before = await readRestoreFilingRace(scene)
  expect(before.filings).toEqual([])
  const observed = await observeTestPostgresClientQueries(
    () =>
      Promise.allSettled([
        finalizeCopyrightActionAfterDelivery(
          scene.restore.id,
          prepared.legal.lease_token,
          'restore',
          scene.restorationAt,
        ),
        appendCopyrightGuestFiling({
          noticeId: scene.notice.id,
          token: capability.token,
          now: filedAt,
          kind: 'court_or_ccb_hold',
          statement: 'A federal court action was filed.',
        }),
      ]),
    undefined,
    () => {},
  )
  expect(observed.observerErrors).toEqual([])
  const owned =
    observed.queries.some(query => query.values.includes(scene.restore.id)) &&
    observed.queries.some(
      query =>
        query.values.includes(scene.notice.id) && query.text.includes('appendCopyrightGuestFiling'),
    )
  expect(owned).toBe(true)
  const [completion, filing] = observed.result
  const value = filing!.status === 'fulfilled' ? filing!.value : undefined
  const completed = {
    ...before.legal,
    ...terminalDeliveryState(before.legal, scene.restore.id, 'completed'),
    accounts: before.legal.accounts.map(account => ({
      ...account,
      incidents: account.incidents.map(incident =>
        incident.notice === scene.notice.id ? { ...incident, operative: false } : incident,
      ),
    })),
    state: {
      ...terminalDeliveryState(before.legal, scene.restore.id, 'completed').state,
      events: [...before.legal.state.events, 'placement_restored'].toSorted(),
    },
  }
  const addFiling = (legal: typeof before.legal) => ({
    legal: {
      ...legal,
      state: {
        ...legal.state,
        events: [...legal.state.events, 'court_or_ccb_hold_received'].toSorted(),
        pointers: [...legal.state.pointers, { id: value?.id, assessment: null, compliant: null }],
      },
    },
    filings: [
      {
        id: value?.id,
        kind: 'court_or_ccb_hold',
        received: filedAt,
        source: 'guest_form',
        actor: null,
        capability: capability.id,
        body: JSON.stringify({ summary: 'A federal court action was filed.' }),
        urgent: filedAt,
        targets: [],
      },
    ],
  })
  const preempted = terminalDeliveryState(
    before.legal,
    scene.restore.id,
    'blocked',
    'A court or CCB filing or legal hold preempted this restoration.',
  )
  const filed = {
    status: 'fulfilled',
    value: { id: expect.any(String), kind: 'court_or_ccb_hold', received_at: filedAt },
  }
  expect([
    {
      completion: { status: 'fulfilled', value: true },
      filing: effectiveReviewConflict,
      state: { ...before, legal: completed },
    },
    {
      completion: { status: 'fulfilled', value: true },
      filing: filed,
      state: addFiling(completed),
    },
    {
      completion: { status: 'fulfilled', value: false },
      filing: filed,
      state: addFiling(preempted),
    },
    {
      completion: nativeCopyrightSerializationConflict,
      filing: filed,
      state: addFiling(preempted),
    },
    {
      completion: nativeCopyrightSerializationConflict,
      filing: effectiveReviewConflict,
      state: before,
    },
  ]).toContainEqual({
    completion: completion!.status === 'fulfilled' ? completion : copyrightRaceResult(completion!),
    filing: filing!.status === 'fulfilled' ? filing : copyrightRaceResult(filing!),
    state: await readRestoreFilingRace(scene),
  })
}
