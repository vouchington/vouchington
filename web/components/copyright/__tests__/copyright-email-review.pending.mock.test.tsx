import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyrightEmailIntakesClientMock as intakesClient } from '@/test-helpers/components/copyright/copyright-email-client-mocks'
import {
  copyrightEmailIntakeId as intakeId,
  makeCopyrightEmailIntake as makeIntake,
  makeCopyrightEmailQueuePage as makeQueuePage,
} from '@/test-helpers/components/copyright/copyright-email-review'
import { CopyrightEmailReview } from '../copyright-email-review'

configure({ testIdAttribute: 'data-pw' })
vi.mock(import('@/lib/api/client/copyright-email-intakes'), () => intakesClient)

describe('CopyrightEmailReview pending detail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intakesClient.listCopyrightEmailIntakes.mockResolvedValue(makeQueuePage())
  })

  it('makes one immediate detail retry while the selected recommendation is still unavailable', async () => {
    const get = intakesClient.getCopyrightEmailIntake
    get.mockResolvedValue({
      copyright_email_intake: makeIntake(intakeId, { recommendation: null }),
    })
    render(<CopyrightEmailReview data={makeQueuePage()} />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(intakeId) }))
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(get).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('heading', { name: 'Staff-private evidence' })).toBeVisible()
  })
})
