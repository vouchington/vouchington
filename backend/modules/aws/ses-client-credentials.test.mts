import { describe, expect, it } from 'vitest'
import { getSesClientCredentials } from './ses.mts'

describe('getSesClientCredentials', () => {
  it('prefers configured SES credentials, including their session token', () => {
    expect(
      getSesClientCredentials({
        AWS_ACCESS_KEY_ID: 'shared-access-key',
        AWS_SECRET_ACCESS_KEY: 'shared-secret-key',
        AWS_SESSION_TOKEN: 'shared-session-token',
        NODE_ENV: 'test',
        SES_AWS_ACCESS_KEY_ID: 'ses-access-key',
        SES_AWS_SECRET_ACCESS_KEY: 'ses-secret-key',
        SES_AWS_SESSION_TOKEN: 'ses-session-token',
      }),
    ).toEqual({
      accessKeyId: 'ses-access-key',
      secretAccessKey: 'ses-secret-key',
      sessionToken: 'ses-session-token',
    })
  })

  it('uses deterministic credentials when NODE_ENV is test', () => {
    expect(getSesClientCredentials({ NODE_ENV: 'test' })).toEqual({
      accessKeyId: 'test-ses-access-key-id',
      secretAccessKey: 'test-ses-secret-access-key',
    })
  })

  it('uses deterministic credentials when VITEST is true', () => {
    expect(getSesClientCredentials({ NODE_ENV: 'development', VITEST: 'true' })).toEqual({
      accessKeyId: 'test-ses-access-key-id',
      secretAccessKey: 'test-ses-secret-access-key',
    })
  })

  it('reports local SES setup requirements in development', () => {
    const error = getThrownError(() => getSesClientCredentials({ NODE_ENV: 'development' }))

    expect(error).toMatchObject({
      message: expect.stringContaining('SES credentials are not configured'),
      status: 503,
    })
  })

  it('prefers explicit credentials even in staging', () => {
    expect(
      getSesClientCredentials({
        ENVIRONMENT: 'staging',
        SES_AWS_ACCESS_KEY_ID: 'ses-access-key',
        SES_AWS_SECRET_ACCESS_KEY: 'ses-secret-key',
      }),
    ).toEqual({
      accessKeyId: 'ses-access-key',
      secretAccessKey: 'ses-secret-key',
    })
  })

  it('uses the ECS task role in staging', () => {
    expect(getSesClientCredentials({ ENVIRONMENT: ' staging ' })).toBeUndefined()
  })

  it('uses the ECS task role in production', () => {
    expect(getSesClientCredentials({ ENVIRONMENT: 'production' })).toBeUndefined()
  })
})

function getThrownError(fn: () => unknown): Error {
  try {
    fn()
  } catch (error) {
    if (error instanceof Error) return error
  }

  throw new Error('Expected function to throw')
}
