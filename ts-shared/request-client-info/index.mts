import {
  ClientInfoValidationError,
  createClientInfoParser,
} from '@vouchington/utils/request-client-info'

export const CLIENT_INFO_HEADERS = {
  client: 'x-voucha-client',
  platform: 'x-voucha-platform',
  appVersion: 'x-voucha-app-version',
  sdkVersion: 'x-voucha-sdk-version',
} as const
export const CLIENT_INFO_HEADER_NAMES = Object.values(CLIENT_INFO_HEADERS)
export const VOUCHA_CLIENT_HEADER = CLIENT_INFO_HEADERS.client
export const VOUCHA_PLATFORM_HEADER = CLIENT_INFO_HEADERS.platform
export const VOUCHA_APP_VERSION_HEADER = CLIENT_INFO_HEADERS.appVersion
export const VOUCHA_SDK_VERSION_HEADER = CLIENT_INFO_HEADERS.sdkVersion
export const VOUCHA_REQUEST_KIND_HEADER = 'x-voucha-request-kind'

export type ClientFamily = 'web' | 'swift' | 'dotnet'
export type ClientPlatform = 'web' | 'ios' | 'ipados' | 'macos' | 'android' | 'windows'

export interface ClientHeaders {
  client: ClientFamily
  platform: ClientPlatform
  appVersion: string
  sdkVersion?: string
}

export interface RequestClientInfo extends ClientHeaders {
  deviceId: string
  ipAddress: string
  requestId?: string
}

export { ClientInfoValidationError }

export const parseClientHeaders = createClientInfoParser({
  headers: CLIENT_INFO_HEADERS,
  clients: ['web', 'swift', 'dotnet'] as const,
  platforms: ['web', 'ios', 'ipados', 'macos', 'android', 'windows'] as const,
  compatiblePlatforms: {
    web: ['web'],
    swift: ['ios', 'ipados', 'macos', 'android'],
    dotnet: ['windows', 'macos'],
  },
})
