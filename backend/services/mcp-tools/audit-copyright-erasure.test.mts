import { runCopyrightAdmissionWinsDestructionRace } from '@voucha/test-helpers/copyright-admission-destruction-race'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { createRetentionEmailCase } from '@voucha/test-helpers/services/copyright-notices/retention-email-case'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  publishCopyrightCasePurgeCoverage,
  settleCopyrightCasePurgeFixtureActions,
  useCopyrightCasePurgePageSize,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import { runIsolatedCopyrightCasePurgePage } from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-isolation'
import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { issueTestOAuthTokensForClient } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { createCopyrightReplayFixture } from '@voucha/test-helpers/copyright-route-replay-setup'
import { markTestCopyrightNoticeErased } from '@voucha/test-helpers/copyright-email-manual-association'
import {
  readTestCopyrightDecisionRationales,
  readTestCopyrightNoticeEvidenceErasedAt,
} from '@voucha/test-helpers/copyright-mcp-audit'
import { readTestMcpCallAuditEvents } from '@voucha/test-helpers/entities/mcp-call-audit'
import { createMcpCallAuditContext, recordMcpCallAudit } from './audit.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'

describe('MCP copyright audit after evidence erasure', () => {
  useAutomaticProvisionalWithholding()
  const bucket = useCopyrightEvidenceBucket()
  const setPageSize = useCopyrightCasePurgePageSize()

  // no-mistakes-timeout-reason: a real case purge is a few hundred bounded pages, each run under the shared purge lock behind every parallel purge test
  it('retains an admitted rationale through purge admission and removes it with the owned case', async () => {
    await setPageSize(100)
    const user = await createTestUser({ administrator: true })
    const { clientId } = await issueTestOAuthTokensForClient(user, {
      audience: 'admin',
      scope: 'mcp.admin:read',
    })
    const fixture = await createRetentionEmailCase()
    await settleCopyrightCasePurgeFixtureActions(fixture.noticeId)
    await publishCopyrightCasePurgeCoverage(fixture.noticeId)
    for (const key of fixture.evidenceKeys) await bucket.put(key, { versions: 2 })
    const context = createMcpCallAuditContext(ADMIN_MCP_SERVER_CONFIG, user.id, {
      credential: 'oauth',
      oauthClientId: clientId,
    })
    let data: CopyrightCasePurgeJobData = {
      noticeId: fixture.noticeId,
      phase: 'parties',
      phaseIndex: 0,
      afterId: null,
      legalClockAt: null,
      proofVersion: null,
    }
    let rationaleIdsAtAdmission: string[] = []
    const { destroyed } = await runCopyrightAdmissionWinsDestructionRace({
      admissionMarker: '/* recordMcpCallAudit:legalRationales */',
      admissionBinding: fixture.noticeId,
      destructionMarker: 'readPendingCopyrightAccountClockSync',
      admit: () =>
        recordMcpCallAudit(context, [
          {
            jsonrpcMethod: 'tools/call',
            toolName: 'replay_copyright_intent',
            outcome: 'accepted',
            copyrightRationale: 'Admitted before purge acquired its case',
            copyrightTarget: { kind: 'notice', id: fixture.noticeId },
          },
        ]),
      destroy: async () => {
        let completed = false
        for (let step = 0; step < 1000; step += 1) {
          const page = await runIsolatedCopyrightCasePurgePage(
            data,
            new Date('2100-01-01T12:00:00.000Z'),
          )
          data = page.data
          if (step === 0)
            rationaleIdsAtAdmission = (await readTestCopyrightDecisionRationales(user.id)).map(
              row => row.id,
            )
          if (!page.hasMore) {
            completed = true
            break
          }
        }
        return completed
      },
    })
    expect(destroyed).toBe(true)
    expect(rationaleIdsAtAdmission).toHaveLength(1)
    expect(await readTestCopyrightDecisionRationales(user.id)).toEqual([])
    expect((await readTestMcpCallAuditEvents(user.id)).map(event => event.outcome)).toEqual([
      'accepted',
    ])
    expect(await Promise.all(fixture.evidenceKeys.map(bucket.countVersions))).toEqual(
      fixture.evidenceKeys.map(() => 0),
    )
  }, 30_000)

  // no-mistakes-timeout-reason: a real case purge is a few hundred bounded pages, each run under the shared purge lock behind every parallel purge test
  it('cannot admit rationale from a snapshot taken before the real purge erases evidence', async () => {
    await setPageSize(100)
    const user = await createTestUser({ administrator: true })
    const { clientId } = await issueTestOAuthTokensForClient(user, {
      audience: 'admin',
      scope: 'mcp.admin:read',
    })
    const fixture = await createRetentionEmailCase()
    await settleCopyrightCasePurgeFixtureActions(fixture.noticeId)
    await publishCopyrightCasePurgeCoverage(fixture.noticeId)
    for (const key of fixture.evidenceKeys) await bucket.put(key, { versions: 2 })
    const context = createMcpCallAuditContext(ADMIN_MCP_SERVER_CONFIG, user.id, {
      credential: 'oauth',
      oauthClientId: clientId,
    })
    let data: CopyrightCasePurgeJobData = {
      noticeId: fixture.noticeId,
      phase: 'parties',
      phaseIndex: 0,
      afterId: null,
      legalClockAt: null,
      proofVersion: null,
    }
    const restore = afterPostgresTransactionQueryForTest(
      '/* recordMcpCallAudit */',
      values => values.includes(context.correlationId),
      async () => {
        for (let step = 0; step < 1000 && data.phase !== 'pointers'; step += 1) {
          const page = await runIsolatedCopyrightCasePurgePage(
            data,
            new Date('2100-01-01T12:00:00.000Z'),
          )
          data = page.data
          if (!page.hasMore) break
        }
      },
    )
    let conflict: unknown
    try {
      await recordMcpCallAudit(context, [
        {
          jsonrpcMethod: 'tools/call',
          toolName: 'replay_copyright_intent',
          outcome: 'accepted',
          copyrightRationale: 'Attempt racing real case erasure',
          copyrightTarget: { kind: 'notice', id: fixture.noticeId },
        },
      ])
    } catch (err) {
      conflict = err
    } finally {
      restore()
    }
    expect(data.phase).toBe('pointers')
    expect(await readTestCopyrightNoticeEvidenceErasedAt(fixture.noticeId)).toEqual(
      expect.any(Date),
    )
    expect(await Promise.all(fixture.evidenceKeys.map(bucket.countVersions))).toEqual(
      fixture.evidenceKeys.map(() => 0),
    )
    expect(await readTestCopyrightDecisionRationales(user.id)).toEqual([])
    expect([
      undefined,
      expect.objectContaining({ status: 409, cause: expect.objectContaining({ code: '40001' }) }),
    ]).toContainEqual(conflict)
    expect((await readTestMcpCallAuditEvents(user.id)).map(event => event.outcome)).toEqual(
      conflict ? [] : ['accepted'],
    )
  }, 30_000)

  it('keeps only the security attempt when rationale admission starts after case erasure', async () => {
    const user = await createTestUser({ administrator: true })
    const { clientId } = await issueTestOAuthTokensForClient(user, {
      audience: 'admin',
      scope: 'mcp.admin:read',
    })
    const fixture = await createCopyrightReplayFixture()
    const context = createMcpCallAuditContext(ADMIN_MCP_SERVER_CONFIG, user.id, {
      credential: 'oauth',
      oauthClientId: clientId,
    })
    await using erasure = await beginTransaction()
    await markTestCopyrightNoticeErased(fixture.noticeId, erasure)
    await erasure.commit()
    await recordMcpCallAudit(context, [
      {
        jsonrpcMethod: 'tools/call',
        toolName: 'replay_copyright_intent',
        outcome: 'accepted',
        copyrightRationale: 'Attempted rationale after erasure',
        copyrightTarget: { kind: 'notice', id: fixture.noticeId },
      },
    ])
    expect((await readTestMcpCallAuditEvents(user.id)).map(event => event.outcome)).toEqual([
      'accepted',
    ])
    expect(await readTestCopyrightDecisionRationales(user.id)).toEqual([])
  })
})
