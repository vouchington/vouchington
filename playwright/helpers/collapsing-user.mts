import type { Page } from '@playwright/test'
import { requireTestValue } from 'vouchington-tooling/playwright'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../backend/test-helpers/index.mts'
import { loginAsUser } from './auth.mts'

/**
 * Collapsing a comment while signed in is saved on the server for that user, so a test that
 * collapses signs in as its own user instead of the shared one the other tests read as.
 */
export async function loginAsCollapsingUser(page: Page): Promise<void> {
  const user = requireTestValue(
    await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS),
    'Failed to create collapsing user',
  )
  await loginAsUser(page, user.id)
}
