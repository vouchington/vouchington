import {
  fireEvent,
  getDefaultNormalizer,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CopyrightEmailIntake } from '@/lib/api/client/copyright-email-intakes'
import {
  copyrightEmailIntakesClientMock as intakesClient,
  copyrightNoticeTargetsClientMock as targetsClient,
} from '@/test-helpers/components/copyright/copyright-email-client-mocks'
import {
  copyrightEmailIntakeId as intakeId,
  makeCopyrightEmailIntake as makeIntake,
  makeCopyrightEmailQueueItem as makeQueueItem,
  makeCopyrightEmailQueuePage as makeQueuePage,
} from '@/test-helpers/components/copyright/copyright-email-review'
import { CopyrightEmailReview } from '../copyright-email-review'

vi.mock(import('@/lib/api/client/copyright-email-intakes'), () => intakesClient)
vi.mock(import('@/lib/api/client/copyright-notice-targets'), async importOriginal => ({
  ...(await importOriginal()),
  ...targetsClient,
}))

const keepNewlines = getDefaultNormalizer({ collapseWhitespace: false })
const parsedEmailRegion = () => screen.getByRole('region', { name: 'Parsed email' })
const downloadHint = 'Download the original email above and enter the statutory fields by hand.'

async function reviewIntake(overrides: Partial<CopyrightEmailIntake>) {
  intakesClient.getCopyrightEmailIntake.mockResolvedValue({
    copyright_email_intake: makeIntake(intakeId, overrides),
  })
  render(<CopyrightEmailReview data={makeQueuePage()} />)
  fireEvent.click(screen.getByRole('button', { name: new RegExp(intakeId) }))
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Staff-private evidence' })).toBeInTheDocument()
  })
}

describe('CopyrightEmailReview parse state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intakesClient.listCopyrightEmailIntakes.mockResolvedValue(makeQueuePage())
    targetsClient.resolveCopyrightNoticeTargets.mockResolvedValue([])
  })

  it('flags queued emails whose parse failed or was never recorded', () => {
    const page = makeQueuePage([
      makeQueueItem(),
      { ...makeQueueItem('019f0000-0000-7000-8000-000000000011'), parse_status: 'failed' },
      { ...makeQueueItem('019f0000-0000-7000-8000-000000000012'), parse_status: 'unparsed' },
    ])
    intakesClient.listCopyrightEmailIntakes.mockResolvedValue(page)

    render(<CopyrightEmailReview data={page} />)

    expect(screen.getAllByText(/^Received/)).toHaveLength(3)
    expect(screen.getAllByText('Parse failed')).toHaveLength(1)
    expect(screen.getAllByText('No parse recorded')).toHaveLength(1)
  })

  it('shows the parser error and how to continue when the parse failed', async () => {
    await reviewIntake({ parsed_email: null, parser_error: 'The MIME body is corrupt.' })

    expect(screen.getByText('Parse failed: The MIME body is corrupt.')).toBeInTheDocument()
    expect(screen.getByText(downloadHint)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Download original email/ })).toHaveAttribute(
      'href',
      `/api/v1/copyright-email-intakes/${intakeId}/raw`,
    )
    expect(screen.queryByText('No parsed email')).not.toBeInTheDocument()
    expect(screen.queryByText('null')).not.toBeInTheDocument()
  })

  it('says no parsed email was recorded instead of printing null', async () => {
    await reviewIntake({ parsed_email: null, parser_error: null })

    expect(screen.queryByText('null')).not.toBeInTheDocument()
    expect(within(parsedEmailRegion()).getByText('No parsed email')).toBeInTheDocument()
    expect(screen.getByText(downloadHint)).toBeInTheDocument()
    expect(screen.queryByText(/Parse failed:/)).not.toBeInTheDocument()
  })

  it('does not point staff at a download when the original is withheld', async () => {
    const intake = makeIntake()
    await reviewIntake({
      parsed_email: null,
      parser_error: 'The MIME body is corrupt.',
      ses_verdicts: { ...intake.ses_verdicts, virus: 'fail' },
      raw_email: { ...intake.raw_email, download_url: null },
    })

    expect(screen.getByText('Parse failed: The MIME body is corrupt.')).toBeInTheDocument()
    expect(screen.getByRole('alert', { name: 'Original email withheld' })).toBeInTheDocument()
    expect(screen.queryByText(downloadHint)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Download original email/ })).not.toBeInTheDocument()
  })

  it('does not point staff at a download when SES flagged malware', async () => {
    const intake = makeIntake()
    await reviewIntake({
      parsed_email: null,
      ses_verdicts: { ...intake.ses_verdicts, virus: 'fail' },
    })

    expect(within(parsedEmailRegion()).getByText('No parsed email')).toBeInTheDocument()
    expect(screen.queryByText(downloadHint)).not.toBeInTheDocument()
  })

  it('shows a parsed email as labelled text with real newlines, not JSON', async () => {
    const body = 'Line one\nLine two\n\nLine four'
    await reviewIntake({
      parsed_email: { sender_email: 'claimant@example.test', subject: 'Takedown', body_text: body },
    })

    expect(screen.getByText(body, { normalizer: keepNewlines })).toBeInTheDocument()
    const parsed = within(parsedEmailRegion())
    expect(parsed.getByText('From')).toBeInTheDocument()
    expect(parsed.getByText('claimant@example.test')).toBeInTheDocument()
    expect(parsed.getByText('Subject')).toBeInTheDocument()
    expect(parsed.getByText('Takedown')).toBeInTheDocument()
    const rendered = parsed.getByText(body, { normalizer: keepNewlines })
    expect(rendered.tagName).toBe('PRE')
    expect(rendered.textContent).toBe(body)
    expect(parsedEmailRegion().textContent).not.toContain('\\n')
    expect(parsedEmailRegion().textContent).not.toContain('body_text')
  })

  it('marks an empty subject or body instead of rendering a blank value', async () => {
    await reviewIntake({
      parsed_email: { sender_email: 'claimant@example.test', subject: '', body_text: '' },
    })

    expect(within(parsedEmailRegion()).getAllByText('(empty)')).toHaveLength(2)
  })

  it('renders untrusted email text inert', async () => {
    const body = '<img src=x onerror=alert(1)> **not bold** [a link](https://evil.example/)'
    await reviewIntake({
      parsed_email: {
        sender_email: 'claimant@example.test',
        subject: '<script>alert(1)</script>',
        body_text: body,
      },
    })

    const parsed = within(parsedEmailRegion())
    expect(parsed.getByText(body)).toBeInTheDocument()
    expect(parsed.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(parsed.queryByRole('img')).not.toBeInTheDocument()
    expect(parsed.queryByRole('link')).not.toBeInTheDocument()
    expect(parsed.queryByText('not bold')).not.toBeInTheDocument()
  })

  it('renders an untrusted parser error inert', async () => {
    const error = 'Bad part <img src=x onerror=alert(1)> **boundary**'
    await reviewIntake({ parsed_email: null, parser_error: error })

    expect(screen.getByText(`Parse failed: ${error}`)).toBeInTheDocument()
    expect(within(parsedEmailRegion()).queryByRole('img')).not.toBeInTheDocument()
    expect(within(parsedEmailRegion()).queryByText('boundary')).not.toBeInTheDocument()
  })

  it('says no agent recommendation exists yet instead of printing null', async () => {
    await reviewIntake({ recommendation: null })

    expect(screen.queryByText('null')).not.toBeInTheDocument()
    const recommendation = within(screen.getByRole('region', { name: 'Agent recommendation' }))
    expect(recommendation.getByText('No agent recommendation yet')).toBeInTheDocument()
  })

  it('still shows a present recommendation', async () => {
    await reviewIntake({})

    const recommendation = screen.getByRole('region', { name: 'Agent recommendation' })
    expect(recommendation).toHaveTextContent('potentially_valid')
    expect(
      within(recommendation).queryByText('No agent recommendation yet'),
    ).not.toBeInTheDocument()
  })
})
