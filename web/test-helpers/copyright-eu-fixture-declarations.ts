import webCopyrightEuDisputeSettlementsParticipant from '../../api-fixtures/v1/responses/web.copyright.eu.dispute-settlements.participant.json'
import webCopyrightEuDisputeSettlementsStaff from '../../api-fixtures/v1/responses/web.copyright.eu.dispute-settlements.staff.json'
import webCopyrightEuJurisdictionAvailability from '../../api-fixtures/v1/responses/web.copyright.eu.jurisdiction-availability.json'
import webCopyrightEuParticipantNoActionComplaint from '../../api-fixtures/v1/responses/web.copyright.eu.participant.no-action-complaint.json'
import webCopyrightEuTerritorialComplaints from '../../api-fixtures/v1/responses/web.copyright.eu.territorial-complaints.json'
import type { PageInfo } from '@voucha/types/pagination'
import type { CopyrightParticipantNoticeDetail } from '@/types/copyright-notices'
import type {
  CopyrightEuDisputeSettlementsPage,
  CopyrightJurisdictionAvailabilityResponse,
} from '@/types/copyright-eu'
import {
  defineWebApiFixture,
  type WebApiFixtureDeclaration,
} from './api-responses/declarations/declaration'

const noticeId = '00000000-0000-7000-8000-000000001218'

type TerritorialComplaintsPage = {
  copyright_territorial_complaints: readonly {
    id: string
    filed_by: 'notifier' | 'poster' | 'reviewer'
    submitted_by_id: string | null
    received_at: string
    explanation: string
    informed_at: string | null
    window_ends_at: string | null
    decision: {
      id: string
      decided_at: string
      staff_disposition: 'maintain' | 'revoke'
      rationale: string
    } | null
  }[]
  page_info: PageInfo
}

export const COPYRIGHT_EU_DECLARATIONS = [
  defineWebApiFixture<CopyrightEuDisputeSettlementsPage>()(
    'web.copyright.eu.dispute-settlements.participant',
    webCopyrightEuDisputeSettlementsParticipant,
    context =>
      context.client.copyrightEuDisputeSettlements.listCopyrightEuDisputeSettlements(noticeId),
  ),
  defineWebApiFixture<CopyrightEuDisputeSettlementsPage>()(
    'web.copyright.eu.dispute-settlements.staff',
    webCopyrightEuDisputeSettlementsStaff,
    context =>
      context.rawServer.get<CopyrightEuDisputeSettlementsPage>(
        `/api/v1/copyright-notices/${noticeId}/eu-dispute-settlements/staff`,
      ),
  ),
  defineWebApiFixture<CopyrightJurisdictionAvailabilityResponse>()(
    'web.copyright.eu.jurisdiction-availability',
    webCopyrightEuJurisdictionAvailability,
    context => context.server.copyrightNotices.getCopyrightJurisdictionAvailabilityServer(),
  ),
  defineWebApiFixture<CopyrightParticipantNoticeDetail>()(
    'web.copyright.eu.participant.no-action-complaint',
    webCopyrightEuParticipantNoActionComplaint.copyright_notice,
    context => context.server.copyrightNotices.getCopyrightParticipantNoticeServer(noticeId),
  ),
  defineWebApiFixture<TerritorialComplaintsPage>()(
    'web.copyright.eu.territorial-complaints',
    webCopyrightEuTerritorialComplaints,
    context =>
      context.rawServer.get<TerritorialComplaintsPage>(
        `/api/v1/copyright-notices/${noticeId}/territorial-complaints`,
      ),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
