import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import {
  createCopyrightEmailApprovalDraft,
  type CopyrightEmailApprovalDraft,
} from '@/components/copyright/copyright-email-approval-model'
import { createCopyrightEmailCorrespondenceDraft } from '@/components/copyright/copyright-email-correspondence-model'
import { CopyrightEmailReviewDetail } from '@/components/copyright/copyright-email-review-detail'
import {
  makeCopyrightEmailIntake,
  makeMatchedCopyrightEmailIntake,
} from '@/test-helpers/components/copyright/copyright-email-review'

type DetailProps = React.ComponentProps<typeof CopyrightEmailReviewDetail>

function resolvedDraft(detail: DetailProps['detail']): CopyrightEmailApprovalDraft {
  const draft = createCopyrightEmailApprovalDraft(detail.recommendation?.structured_output)
  return {
    ...draft,
    targets: draft.targets.map(target => ({ ...target, resolution_status: 'resolved' as const })),
  }
}

function StatefulDetail(props: DetailProps) {
  const [draft, setDraft] = useState(props.draft)
  const [rationale, setRationale] = useState(props.rationale)
  const [fallback, setFallback] = useState(props.manualFallbackReason)
  const [replyEmail, setReplyEmail] = useState(props.replyEmail)
  const [correspondence, setCorrespondence] = useState(props.correspondenceDraft)
  return (
    <CopyrightEmailReviewDetail
      {...props}
      correspondenceDraft={correspondence}
      draft={draft}
      manualFallbackReason={fallback}
      onChangeCorrespondenceDraft={setCorrespondence}
      onChangeDraft={setDraft}
      onChangeManualFallbackReason={setFallback}
      onChangeRationale={setRationale}
      onChangeReplyEmail={setReplyEmail}
      rationale={rationale}
      replyEmail={replyEmail}
    />
  )
}

const initial = makeCopyrightEmailIntake()

const meta = {
  title: 'Copyright/Email Review Detail',
  component: CopyrightEmailReviewDetail,
  render: args => <StatefulDetail {...args} />,
  args: {
    detail: initial,
    draft: resolvedDraft(initial),
    loading: false,
    rationale: '',
    manualFallbackReason: '',
    replyEmail: '',
    correspondenceDraft: createCopyrightEmailCorrespondenceDraft(),
    onChangeDraft: fn(),
    onChangeRationale: fn(),
    onChangeManualFallbackReason: fn(),
    onChangeReplyEmail: fn(),
    onChangeCorrespondenceDraft: fn(),
    onApproveInitial: fn(),
    onRejectInitial: fn(),
    onRequestInformation: fn(),
    onAdmitCorrespondence: fn(),
    onRejectCorrespondence: fn(),
    onAssociateWithNotice: fn(),
  },
} satisfies Meta<typeof CopyrightEmailReviewDetail>

export default meta
type Story = StoryObj<typeof meta>

export const InitialIntakeAwaitingRationale: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Staff-private evidence')).toBeVisible()
    await expect(canvas.getByText('Agent recommendation')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Approve structured intake' })).toBeDisabled()
    await userEvent.type(canvas.getByLabelText('Review rationale'), 'Complete notice.')
    await expect(canvas.getByRole('button', { name: 'Reject email intake' })).toBeEnabled()
  },
}

export const FailedParseWithoutRecommendation: Story = {
  args: {
    detail: makeCopyrightEmailIntake(undefined, {
      parsed_email: null,
      parser_error: 'The message body could not be decoded.',
      recommendation: null,
    }),
    draft: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No agent recommendation yet')).toBeVisible()
    await expect(canvas.getByLabelText('Manual fallback reason')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Reject email intake' })).toBeDisabled()
  },
}

export const QuarantinedOriginal: Story = {
  args: {
    detail: makeCopyrightEmailIntake(undefined, {
      raw_email: { ...initial.raw_email, download_url: null },
      ses_verdicts: { ...initial.ses_verdicts, virus: 'fail', spam: 'gray' },
    }),
  },
}

export const MatchedCorrespondence: Story = {
  args: { detail: makeMatchedCopyrightEmailIntake(), draft: null, rationale: 'Reviewed.' },
}

export const UnresolvedReply: Story = {
  args: {
    detail: makeCopyrightEmailIntake(undefined, {
      review_path: 'unresolved_thread',
      parsed_email: null,
    }),
    draft: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/root email has not yet been admitted/)).toBeVisible()
  },
}

export const ConflictingCases: Story = {
  args: {
    detail: makeCopyrightEmailIntake(undefined, {
      review_path: 'ancestor_notice_conflict',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/reaches more than one case/)).toBeVisible()
  },
}
