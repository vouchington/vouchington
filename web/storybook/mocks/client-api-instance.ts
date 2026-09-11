import { ClientRequest } from '@/lib/api/client/request'
import type { EmailPreferences } from '@/lib/api/client/email-preferences'

let notificationSettingsFixture: EmailPreferences | undefined
const clientRequestGet = ClientRequest.prototype.get

export function setNotificationSettingsFixture(preferences: EmailPreferences): void {
  notificationSettingsFixture = preferences
}

export function clearNotificationSettingsFixture(): void {
  notificationSettingsFixture = undefined
}

ClientRequest.prototype.get = function storybookClientRequestGet<T>(
  endpoint: string,
  options?: {
    searchParams?: Record<string, string | number | boolean | undefined>
    signal?: AbortSignal
  },
): Promise<T> {
  if (
    endpoint === '/api/v1/my/email-preferences' &&
    options?.searchParams === undefined &&
    notificationSettingsFixture !== undefined
  ) {
    return Promise.resolve({ email_preferences: notificationSettingsFixture } as T)
  }

  // Function.call does not preserve the generic return type of a method, although this is the
  // original ClientRequest.get implementation invoked with its original receiver.
  return clientRequestGet.call(this, endpoint, options) as Promise<T>
}
