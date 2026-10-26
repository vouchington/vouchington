'use client'

import { withWebLock } from '@vouchington/utils/web-push-binding'

export function withWebPushOwnershipLock<T>(operation: () => Promise<T>): Promise<T> {
  return withWebLock('voucha:web-push-ownership', operation)
}
