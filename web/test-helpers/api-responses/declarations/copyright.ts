import webCopyrightEmailIntakeQueueDefault from '../../../../api-fixtures/v1/responses/web.copyright.email-intake-queue.default.json'
import webCopyrightNoticesDefault from '../../../../api-fixtures/v1/responses/web.copyright.notices.default.json'
import webCopyrightNoticesNullClaimant from '../../../../api-fixtures/v1/responses/web.copyright.notices.null-claimant.json'
import webCopyrightNoticeDetailPopulated from '../../../../api-fixtures/v1/responses/web.copyright.notice.detail.populated.json'
import webCopyrightNoticeDetailNullClaimant from '../../../../api-fixtures/v1/responses/web.copyright.notice.detail.null-claimant.json'
import webCopyrightNoticeParticipantPopulated from '../../../../api-fixtures/v1/responses/web.copyright.notice.participant.populated.json'
import webCopyrightNoticeParticipantNullClaimant from '../../../../api-fixtures/v1/responses/web.copyright.notice.participant.null-claimant.json'
import webCopyrightGuestCapabilitiesListed from '../../../../api-fixtures/v1/responses/web.copyright.guest-capabilities.listed.json'
import webCopyrightGuestCapabilityIssued from '../../../../api-fixtures/v1/responses/web.copyright.guest-capability.issued.json'
import webCopyrightGuestCapabilityRevoked from '../../../../api-fixtures/v1/responses/web.copyright.guest-capability.revoked.json'
import webCopyrightGuestFilingReceived from '../../../../api-fixtures/v1/responses/web.copyright.guest-filing.received.json'
import webCopyrightGuestInformationRequested from '../../../../api-fixtures/v1/responses/web.copyright.guest-information.requested.json'
import webCopyrightStaffQueueDefault from '../../../../api-fixtures/v1/responses/web.copyright.staff-queue.default.json'
import type {
  CopyrightEmailIntakeQueuePage,
  CopyrightNoticesPage,
  CopyrightNoticeDetail,
  CopyrightParticipantNoticeDetail,
  CopyrightStaffQueuePage,
} from '@/types/copyright-notices'
import type { CopyrightGuestCapabilitiesPage } from '@/lib/api/client/copyright-guest'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const COPYRIGHT_DECLARATIONS = [
  defineWebApiFixture<CopyrightNoticesPage>()(
    'web.copyright.notices.default',
    webCopyrightNoticesDefault,
    context => context.server.copyrightNotices.getCopyrightNotices(),
    [context => context.client.copyrightNotices.listCopyrightNotices()],
  ),
  defineWebApiFixture<CopyrightNoticesPage>()(
    'web.copyright.notices.null-claimant',
    webCopyrightNoticesNullClaimant,
    context => context.server.copyrightNotices.getCopyrightNotices(),
    [context => context.client.copyrightNotices.listCopyrightNotices()],
  ),
  defineWebApiFixture<CopyrightNoticeDetail>()(
    'web.copyright.notice.detail.populated',
    webCopyrightNoticeDetailPopulated.copyright_notice,
    context =>
      context.server.copyrightNotices.getCopyrightNoticeServer(
        '00000000-0000-7000-8000-000000000804',
      ),
    [
      context =>
        context.client.copyrightNotices
          .getCopyrightNotice('00000000-0000-7000-8000-000000000804')
          .then(response => response.copyright_notice),
    ],
  ),
  defineWebApiFixture<CopyrightNoticeDetail>()(
    'web.copyright.notice.detail.null-claimant',
    webCopyrightNoticeDetailNullClaimant.copyright_notice,
    context =>
      context.server.copyrightNotices.getCopyrightNoticeServer(
        '00000000-0000-7000-8000-000000000804',
      ),
    [
      context =>
        context.client.copyrightNotices
          .getCopyrightNotice('00000000-0000-7000-8000-000000000804')
          .then(response => response.copyright_notice),
    ],
  ),
  defineWebApiFixture<CopyrightParticipantNoticeDetail>()(
    'web.copyright.notice.participant.populated',
    webCopyrightNoticeParticipantPopulated.copyright_notice,
    context =>
      context.server.copyrightNotices.getCopyrightParticipantNoticeServer(
        '00000000-0000-7000-8000-000000000804',
      ),
    [
      context =>
        context.client.copyrightNotices
          .getCopyrightParticipantNotice('00000000-0000-7000-8000-000000000804')
          .then(response => response.copyright_notice),
    ],
  ),
  defineWebApiFixture<CopyrightParticipantNoticeDetail>()(
    'web.copyright.notice.participant.null-claimant',
    webCopyrightNoticeParticipantNullClaimant.copyright_notice,
    context =>
      context.server.copyrightNotices.getCopyrightParticipantNoticeServer(
        '00000000-0000-7000-8000-000000000804',
      ),
    [
      context =>
        context.client.copyrightNotices
          .getCopyrightParticipantNotice('00000000-0000-7000-8000-000000000804')
          .then(response => response.copyright_notice),
    ],
  ),
  defineWebApiFixture<CopyrightStaffQueuePage>()(
    'web.copyright.staff-queue.default',
    webCopyrightStaffQueueDefault,
    context => context.server.copyrightNotices.getCopyrightReviewQueue(),
    [context => context.client.copyrightNotices.listCopyrightReviewQueue()],
  ),
  defineWebApiFixture<CopyrightEmailIntakeQueuePage>()(
    'web.copyright.email-intake-queue.default',
    webCopyrightEmailIntakeQueueDefault,
    context => context.server.copyrightNotices.getCopyrightEmailIntakeReviewQueue(),
    [context => context.client.copyrightEmailIntakes.listCopyrightEmailIntakes()],
  ),
  defineWebApiFixture<{
    copyright_guest_capability: { id: string; expires_at: string; token: string }
  }>()('web.copyright.guest-capability.issued', webCopyrightGuestCapabilityIssued, context =>
    context.client.copyrightGuest.issueCopyrightGuestCapability(
      '00000000-0000-7000-8000-000000000830',
      '2026-08-01T12:00:00.000Z',
    ),
  ),
  defineWebApiFixture<CopyrightGuestCapabilitiesPage>()(
    'web.copyright.guest-capabilities.listed',
    webCopyrightGuestCapabilitiesListed,
    context =>
      context.client.copyrightGuest.listCopyrightGuestCapabilities(
        '00000000-0000-7000-8000-000000000830',
      ),
  ),
  defineWebApiFixture<{
    copyright_guest_capability: { id: string; revoked_at: string }
  }>()('web.copyright.guest-capability.revoked', webCopyrightGuestCapabilityRevoked, context =>
    context.client.copyrightGuest.revokeCopyrightGuestCapability(
      '00000000-0000-7000-8000-000000000830',
      '00000000-0000-7000-8000-000000000831',
    ),
  ),
  defineWebApiFixture<{ copyright_correspondence: { id: string } }>()(
    'web.copyright.guest-information.requested',
    webCopyrightGuestInformationRequested,
    context =>
      context.client.copyrightGuest.requestCopyrightGuestInformation(
        '00000000-0000-7000-8000-000000000830',
        '00000000-0000-7000-8000-000000000831',
        'Send the registration number.',
      ),
  ),
  defineWebApiFixture<{
    copyright_submission: {
      id: string
      kind: 'supplement' | 'withdrawal' | 'court_or_ccb_hold'
      received_at: string
    }
  }>()('web.copyright.guest-filing.received', webCopyrightGuestFilingReceived, context =>
    context.client.copyrightGuest.submitCopyrightGuestFiling({
      noticeId: '00000000-0000-7000-8000-000000000830',
      token: 'fixture-guest-capability-token',
      kind: 'supplement',
      statement: 'Corrected work description.',
      cf_turnstile_response: 'fixture-turnstile-token',
    }),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
