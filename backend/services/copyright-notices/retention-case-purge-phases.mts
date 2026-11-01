import type { TransactionQuery } from '@data-stores/psql'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import sql from 'sql-template-strings'
import {
  COPYRIGHT_CASE_PARTY_SOURCE_COUNT,
  retainCopyrightCasePartyPage,
} from './retention-case-purge-parties.mts'
import { verifyCopyrightCaseReportCoveragePage } from './retention-case-purge-coverage.mts'
import { eraseCopyrightCaseEvidencePage } from './retention-case-purge-evidence.mts'
import {
  hasBlockedCopyrightCaseParty,
  verifyCopyrightCasePartyPage,
} from './retention-case-purge-verify-parties.mts'
import {
  COPYRIGHT_CASE_POINTER_PHASE_COUNT,
  cutCopyrightCasePointerPage,
} from './retention-case-purge-pointers.mts'
import {
  COPYRIGHT_CASE_CHILD_PHASE_COUNT,
  deleteCopyrightCaseChildPage,
  verifyCopyrightCaseChildPage,
} from './retention-case-purge-children.mts'
import { deleteCopyrightCaseFinalTail } from './retention-case-purge-final.mts'
import { deleteCopyrightCaseEmailThreadLinkPage } from './retention-case-purge-email-links.mts'
import { COPYRIGHT_CASE_EMAIL_LINK_PHASE_INDEX } from './retention-case-purge-order.mts'
import { enterCopyrightCasePurgePhase } from './retention-case-purge-phase-state.mts'

type PageResult = { data: CopyrightCasePurgeJobData; hasMore: boolean; deferred?: boolean }
type EligibleNotice = { id: string; jurisdiction: string; last_legal_activity_at: Date }

export async function runLockedPage(
  query: TransactionQuery,
  data: CopyrightCasePurgeJobData,
  notice: EligibleNotice,
  pageSize: number,
): Promise<PageResult> {
  switch (data.phase) {
    case 'parties': {
      if (data.phaseIndex >= COPYRIGHT_CASE_PARTY_SOURCE_COUNT)
        return {
          data: enterCopyrightCasePurgePhase(data, 'verify_parties'),
          hasMore: true,
        }
      const page = await retainCopyrightCasePartyPage(
        query,
        data.noticeId,
        data.phaseIndex,
        data.afterId,
        pageSize,
      )
      return {
        data: {
          ...data,
          phaseIndex: page.hasMore ? data.phaseIndex : data.phaseIndex + 1,
          afterId: page.hasMore ? page.nextId : null,
        },
        hasMore: true,
      }
    }
    case 'verify_parties': {
      const page = await verifyCopyrightCasePartyPage(query, data.noticeId, data.afterId, pageSize)
      if (page.blocked) return { data, hasMore: false }
      if (page.clockAdvanced) {
        return {
          data: { ...data, phaseIndex: 0, afterId: null },
          hasMore: true,
        }
      }
      return {
        data: page.hasMore
          ? { ...data, afterId: page.nextId }
          : enterCopyrightCasePurgePhase(data, 'verify_children'),
        hasMore: true,
      }
    }
    case 'verify_children': {
      if (data.phaseIndex >= COPYRIGHT_CASE_CHILD_PHASE_COUNT)
        return {
          data: enterCopyrightCasePurgePhase(data, 'coverage'),
          hasMore: true,
        }
      const page = await verifyCopyrightCaseChildPage(
        query,
        data.noticeId,
        data.phaseIndex,
        data.childFrames,
        pageSize,
      )
      if (page.blocked) return { data, hasMore: false }
      return {
        data: { ...data, phaseIndex: page.nextPhaseIndex, childFrames: page.childFrames },
        hasMore: true,
      }
    }
    case 'coverage':
      return verifyCopyrightCaseReportCoveragePage(query, data, notice.jurisdiction, pageSize)
    case 'evidence': {
      if (data.phaseIndex > 1) {
        await query(sql`/* finishCopyrightCaseEvidenceErasure */
          UPDATE copyright_notices SET evidence_erased_at = COALESCE(evidence_erased_at, clock_timestamp())
          WHERE id = ${data.noticeId}::uuid`)
        return { data: enterCopyrightCasePurgePhase(data, 'pointers'), hasMore: true }
      }
      const page = await eraseCopyrightCaseEvidencePage(
        query,
        data.noticeId,
        data.phaseIndex,
        data.afterId,
        data.evidenceOwner,
        pageSize,
      )
      return {
        data: {
          ...data,
          phaseIndex: page.nextSourceIndex,
          afterId: page.nextId,
          evidenceOwner: page.evidenceOwner,
        },
        hasMore: page.hasMore,
      }
    }
    case 'pointers': {
      if (data.phaseIndex >= COPYRIGHT_CASE_POINTER_PHASE_COUNT)
        return { data: enterCopyrightCasePurgePhase(data, 'children'), hasMore: true }
      const page = await cutCopyrightCasePointerPage(
        query,
        data.noticeId,
        data.phaseIndex,
        pageSize,
        data.afterId,
      )
      return {
        data: { ...data, phaseIndex: page.nextPhaseIndex, afterId: page.nextAfterId },
        hasMore: true,
      }
    }
    case 'children': {
      if (data.phaseIndex >= COPYRIGHT_CASE_CHILD_PHASE_COUNT)
        return {
          data: enterCopyrightCasePurgePhase(data, 'final'),
          hasMore: true,
        }
      if (data.phaseIndex === COPYRIGHT_CASE_EMAIL_LINK_PHASE_INDEX) {
        const deleted = await deleteCopyrightCaseEmailThreadLinkPage(query, data.noticeId)
        return {
          data: {
            ...data,
            phaseIndex: deleted ? data.phaseIndex : data.phaseIndex + 1,
            childFrames: undefined,
            afterId: null,
          },
          hasMore: true,
        }
      }
      const page = await deleteCopyrightCaseChildPage(
        query,
        data.noticeId,
        data.phaseIndex,
        data.childFrames,
        pageSize,
      )
      return {
        data: {
          ...data,
          phaseIndex: page.nextPhaseIndex,
          afterId: null,
          childFrames: page.childFrames,
        },
        hasMore: true,
      }
    }
    case 'final':
      if (await hasBlockedCopyrightCaseParty(query, data.noticeId)) return { data, hasMore: false }
      await deleteCopyrightCaseFinalTail(query, data.noticeId)
      return {
        data: enterCopyrightCasePurgePhase(data, 'residual_parties'),
        hasMore: true,
      }
    case 'residual_parties':
      throw new Error('Residual case parties are handled after the live notice is gone')
  }
}
