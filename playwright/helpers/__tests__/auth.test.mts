import { afterEach, describe, expect, it, vi } from 'vitest'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'
import { loginAsAdmin, loginAsUser, loginAsTestUser } from '../auth.mts'

const TEST_DID = '019f0000-0000-7000-8000-000000000010'
const TEST_UID = '019f0000-0000-7000-8000-000000000011'
const TEST_SID = '019f0000-0000-7000-8000-000000000012'

const mockCreateDeviceAndSessionTokens = vi.fn<() => unknown>()
const mockCreateVerifiedMfaTestSession = vi.fn<() => unknown>()
const mockAddCookies = vi.fn<() => unknown>()

function createMockTokenResult(deviceToken: string, sessionToken: string) {
  return {
    deviceToken: { token: deviceToken, payload: { did: TEST_DID } },
    sessionToken: {
      token: sessionToken,
      payload: {
        did: TEST_DID,
        sid: TEST_SID,
        uid: TEST_UID,
      },
    },
  }
}

function createMockPage() {
  const goto = vi.fn<() => unknown>().mockResolvedValue(undefined)
  const reload = vi.fn<() => unknown>().mockResolvedValue(undefined)
  const waitForURL = vi.fn<() => unknown>().mockResolvedValue(undefined)
  const context = vi.fn<() => unknown>().mockReturnValue({ addCookies: mockAddCookies })
  const url = vi.fn<() => unknown>().mockReturnValue('https://example.test/dashboard')
  return {
    evaluate: vi.fn<() => Promise<string>>().mockResolvedValue('Synthetic browser'),
    goto,
    reload,
    waitForURL,
    context,
    url,
  }
}

describe('loginAsUser helpers', () => {
  afterEach(() => {
    mockCreateDeviceAndSessionTokens.mockReset()
    mockCreateVerifiedMfaTestSession.mockReset()
    mockAddCookies.mockReset()
  })

  it('loginAsUser injects device/session cookies without post-login navigation', async () => {
    mockCreateDeviceAndSessionTokens.mockResolvedValue(
      createMockTokenResult('device-token', 'session-token'),
    )

    const page = createMockPage()
    await loginAsUser(page as never, TEST_UID, {
      createDeviceAndSessionTokens: mockCreateDeviceAndSessionTokens as never,
      mintUUIDv7: () => TEST_DID,
      cookieOrigin: () => 'https://example.test',
    })

    expect(mockCreateDeviceAndSessionTokens).toHaveBeenCalledWith({
      did: TEST_DID,
      uid: TEST_UID,
      deviceContext: { user_agent: 'Synthetic browser' },
    })
    // No navigation at all: the cookie origin comes from the project baseURL.
    expect(page.goto).not.toHaveBeenCalled()
    expect(page.context).toHaveBeenCalledTimes(1)
    expect(mockAddCookies).toHaveBeenCalledWith([
      {
        httpOnly: true,
        name: 'dt',
        sameSite: 'Lax',
        url: 'https://example.test',
        value: 'device-token',
      },
      {
        httpOnly: true,
        name: 'st',
        sameSite: 'Lax',
        url: 'https://example.test',
        value: 'session-token',
      },
    ])
    expect(page.reload).not.toHaveBeenCalled()
    expect(page.waitForURL).not.toHaveBeenCalled()
  })

  it('requires verified factor cookies for the seeded administrator in both helpers', async () => {
    mockCreateVerifiedMfaTestSession.mockResolvedValue(
      createMockTokenResult('admin-device-token', 'admin-session-token'),
    )

    const page = createMockPage()

    const dependencies = {
      createDeviceAndSessionTokens: mockCreateDeviceAndSessionTokens as never,
      createVerifiedMfaTestSession: mockCreateVerifiedMfaTestSession as never,
      mintUUIDv7: () => TEST_DID,
      cookieOrigin: () => 'https://example.test',
    }

    await loginAsTestUser(page as never, dependencies)
    expect(mockCreateVerifiedMfaTestSession).toHaveBeenCalledWith(TEST_USER_ID, {
      user_agent: 'Synthetic browser',
    })
    await loginAsAdmin(page as never, dependencies)
    expect(mockCreateDeviceAndSessionTokens).not.toHaveBeenCalled()
    expect(mockCreateVerifiedMfaTestSession).toHaveBeenCalledTimes(2)
    expect(mockCreateVerifiedMfaTestSession).toHaveBeenCalledWith(TEST_USER_ID, {
      user_agent: 'Synthetic browser',
    })
    expect(mockAddCookies).toHaveBeenLastCalledWith([
      expect.objectContaining({ name: 'dt', value: 'admin-device-token' }),
      expect.objectContaining({ name: 'st', value: 'admin-session-token' }),
    ])
  })
})
