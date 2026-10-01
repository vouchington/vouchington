import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CopyrightEmailSesVerdicts } from '@/lib/api/client/copyright-email-intakes'
import {
  copyrightEmailIntakesClientMock as intakesClient,
  copyrightNoticeTargetsClientMock as targetsClient,
} from '@/test-helpers/components/copyright/copyright-email-client-mocks'
import {
  copyrightEmailIntakeId as intakeId,
  makeCopyrightEmailIntake as makeIntake,
  makeCopyrightEmailQueuePage as makeQueuePage,
} from '@/test-helpers/components/copyright/copyright-email-review'
import { CopyrightEmailReview } from '../copyright-email-review'

vi.mock(import('@/lib/api/client/copyright-email-intakes'), () => intakesClient)
vi.mock(import('@/lib/api/client/copyright-notice-targets'), () => targetsClient)

const passing: CopyrightEmailSesVerdicts = {
  spf: 'pass',
  dkim: 'pass',
  dmarc: 'pass',
  spam: 'pass',
  virus: 'pass',
}

const verdictsRegion = () =>
  screen.getByRole('region', { name: 'Email authentication and scan results' })
const riskNote = () => screen.queryByRole('note', { name: 'Authentication risk' })
const malwareUnconfirmed = () => screen.queryByRole('note', { name: 'Malware scan not confirmed' })
const quarantined = () => screen.queryByRole('alert', { name: 'Original email withheld' })
const originalDownload = () => screen.queryByRole('link', { name: /Download original email/ })

// Badges render in the fixed order SPF, DKIM, DMARC, spam, malware.
function reportedVerdicts() {
  return within(verdictsRegion())
    .getAllByRole('definition')
    .map(badge => badge.textContent)
}

async function reviewIntake(
  sesVerdicts: CopyrightEmailSesVerdicts,
  downloadUrl: string | null = `/api/v1/copyright-email-intakes/${intakeId}/raw`,
) {
  const intake = makeIntake()
  intakesClient.getCopyrightEmailIntake.mockResolvedValue({
    copyright_email_intake: {
      ...intake,
      ses_verdicts: sesVerdicts,
      raw_email: { ...intake.raw_email, download_url: downloadUrl },
    },
  })
  render(<CopyrightEmailReview data={makeQueuePage()} />)
  fireEvent.click(screen.getByRole('button', { name: new RegExp(intakeId) }))
  await waitFor(() => expect(verdictsRegion()).toBeVisible())
}

describe('CopyrightEmailReview SES verdicts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intakesClient.listCopyrightEmailIntakes.mockResolvedValue(makeQueuePage())
    targetsClient.resolveCopyrightNoticeTargets.mockResolvedValue([])
  })

  it('shows every SES verdict with the original download when all pass', async () => {
    await reviewIntake(passing)

    expect(reportedVerdicts()).toEqual(['Pass', 'Pass', 'Pass', 'Pass', 'Pass'])
    expect(verdictsRegion()).toHaveTextContent('DKIM Pass means a signature validated')
    expect(riskNote()).not.toBeInTheDocument()
    expect(malwareUnconfirmed()).not.toBeInTheDocument()
    expect(originalDownload()).toBeInTheDocument()
  })

  it('shows authentication failures as risk notes without blocking any review action', async () => {
    await reviewIntake({ ...passing, spf: 'fail', dkim: 'fail', dmarc: 'fail', spam: 'fail' })

    const note = riskNote()
    expect(note).toHaveTextContent('SPF failed')
    expect(note).toHaveTextContent('DKIM failed')
    expect(note).toHaveTextContent('DMARC failed')
    expect(note).toHaveTextContent('SES classified this message as spam')
    expect(note).toHaveTextContent('not a decision')
    expect(reportedVerdicts()).toEqual(['Fail', 'Fail', 'Fail', 'Fail', 'Pass'])
    expect(screen.getByLabelText('Review rationale')).toBeEnabled()
    expect(originalDownload()).toBeInTheDocument()
  })

  it('withholds the download and explains why when SES reported malware', async () => {
    await reviewIntake({ ...passing, virus: 'fail' }, null)

    expect(quarantined()).toHaveTextContent('SES reported malware in this message')
    expect(originalDownload()).not.toBeInTheDocument()
    expect(reportedVerdicts()).toEqual(['Pass', 'Pass', 'Pass', 'Pass', 'Fail'])
    expect(screen.getByLabelText('Review rationale')).toBeEnabled()
  })

  it.each([
    ['gray', 'Inconclusive'],
    ['processing_failed', 'Check failed'],
    ['unknown', 'Not reported'],
  ] as const)(
    'warns but keeps the download when the malware scan is %s',
    async (virus, verdictLabel) => {
      await reviewIntake({ ...passing, virus })

      expect(malwareUnconfirmed()).toHaveTextContent(`malware scan: ${verdictLabel}`)
      expect(originalDownload()).toBeInTheDocument()
      expect(quarantined()).not.toBeInTheDocument()
    },
  )
})
