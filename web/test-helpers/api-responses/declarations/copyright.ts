import webCopyrightEmailIntakeQueueDefault from '../../../../api-fixtures/v1/responses/web.copyright.email-intake-queue.default.json'
import webCopyrightNoticesDefault from '../../../../api-fixtures/v1/responses/web.copyright.notices.default.json'
import webCopyrightNoticesNullClaimant from '../../../../api-fixtures/v1/responses/web.copyright.notices.null-claimant.json'
import webCopyrightNoticeDetailPopulated from '../../../../api-fixtures/v1/responses/web.copyright.notice.detail.populated.json'
import webCopyrightNoticeDetailNullClaimant from '../../../../api-fixtures/v1/responses/web.copyright.notice.detail.null-claimant.json'
import webCopyrightNoticeParticipantPopulated from '../../../../api-fixtures/v1/responses/web.copyright.notice.participant.populated.json'
import webCopyrightNoticeParticipantNullClaimant from '../../../../api-fixtures/v1/responses/web.copyright.notice.participant.null-claimant.json'
import webCopyrightStaffQueueDefault from '../../../../api-fixtures/v1/responses/web.copyright.staff-queue.default.json'
import type {
  CopyrightEmailIntakeQueuePage,
  CopyrightNoticesPage,
  CopyrightNoticeDetail,
  CopyrightParticipantNoticeDetail,
  CopyrightStaffQueuePage,
} from '@/types/copyright-notices'
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
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
