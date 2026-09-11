import { describe, expect, it } from 'vitest'
import {
  getBedrockCredentials,
  getFirehoseCredentials,
  getSESCredentials,
  getS3Credentials,
} from './credentials.mts'
import { setupCredentialEnv } from './credentials-test-helpers.mts'

describe('credentials', () => {
  const { setEnv } = setupCredentialEnv()

  describe('AWS credentials helpers', () => {
    it('getS3Credentials includes sessionToken when AWS_SESSION_TOKEN is set (STS / OIDC)', () => {
      setEnv('AWS_ACCESS_KEY_ID', 'sts-akid')
      setEnv('AWS_SECRET_ACCESS_KEY', 'sts-secret')
      setEnv('AWS_SESSION_TOKEN', 'sts-session-token')

      expect(getS3Credentials()).toEqual({
        accessKeyId: 'sts-akid',
        secretAccessKey: 'sts-secret',
        sessionToken: 'sts-session-token',
      })
    })

    it('getSESCredentials includes sessionToken when AWS_SESSION_TOKEN is set (STS / OIDC)', () => {
      setEnv('AWS_ACCESS_KEY_ID', 'sts-akid')
      setEnv('AWS_SECRET_ACCESS_KEY', 'sts-secret')
      setEnv('AWS_SESSION_TOKEN', 'sts-session-token')

      expect(getSESCredentials()).toEqual({
        accessKeyId: 'sts-akid',
        secretAccessKey: 'sts-secret',
        sessionToken: 'sts-session-token',
      })
    })

    it('getBedrockCredentials includes sessionToken when AWS_SESSION_TOKEN is set (STS / OIDC)', () => {
      setEnv('AWS_ACCESS_KEY_ID', 'sts-akid')
      setEnv('AWS_SECRET_ACCESS_KEY', 'sts-secret')
      setEnv('AWS_SESSION_TOKEN', 'sts-session-token')

      expect(getBedrockCredentials()).toEqual({
        accessKeyId: 'sts-akid',
        secretAccessKey: 'sts-secret',
        sessionToken: 'sts-session-token',
      })
    })

    it('getFirehoseCredentials includes sessionToken when AWS_SESSION_TOKEN is set (STS / OIDC)', () => {
      setEnv('AWS_ACCESS_KEY_ID', 'sts-akid')
      setEnv('AWS_SECRET_ACCESS_KEY', 'sts-secret')
      setEnv('AWS_SESSION_TOKEN', 'sts-session-token')

      expect(getFirehoseCredentials()).toEqual({
        accessKeyId: 'sts-akid',
        secretAccessKey: 'sts-secret',
        sessionToken: 'sts-session-token',
      })
    })

    it('getS3Credentials prefers S3-specific session token over shared AWS_SESSION_TOKEN', () => {
      setEnv('S3_AWS_ACCESS_KEY_ID', 's3-akid')
      setEnv('S3_AWS_SECRET_ACCESS_KEY', 's3-secret')
      setEnv('S3_AWS_SESSION_TOKEN', 's3-session')
      setEnv('AWS_SESSION_TOKEN', 'fallback-session')

      expect(getS3Credentials()).toEqual({
        accessKeyId: 's3-akid',
        secretAccessKey: 's3-secret',
        sessionToken: 's3-session',
      })
    })

    it('does not pair S3-specific keys with an unrelated global AWS_SESSION_TOKEN', () => {
      // Mixing service-specific access/secret keys (long-lived IAM user) with a
      // global STS session token from another credential source (e.g. OIDC on
      // the runner) yields an invalid credential tuple that AWS rejects.
      // The session token must stay paired with the access/secret pair it
      // actually belongs to.
      setEnv('S3_AWS_ACCESS_KEY_ID', 's3-akid')
      setEnv('S3_AWS_SECRET_ACCESS_KEY', 's3-secret')
      setEnv('S3_AWS_SESSION_TOKEN', undefined)
      setEnv('AWS_SESSION_TOKEN', 'unrelated-oidc-session-token')

      expect(getS3Credentials()).toEqual({
        accessKeyId: 's3-akid',
        secretAccessKey: 's3-secret',
      })
    })

    it('does not pair SES-specific keys with an unrelated global AWS_SESSION_TOKEN', () => {
      setEnv('SES_AWS_ACCESS_KEY_ID', 'ses-akid')
      setEnv('SES_AWS_SECRET_ACCESS_KEY', 'ses-secret')
      setEnv('SES_AWS_SESSION_TOKEN', undefined)
      setEnv('AWS_SESSION_TOKEN', 'unrelated-oidc-session-token')

      expect(getSESCredentials()).toEqual({
        accessKeyId: 'ses-akid',
        secretAccessKey: 'ses-secret',
      })
    })

    it('does not pair Bedrock-specific keys with an unrelated global AWS_SESSION_TOKEN', () => {
      setEnv('BEDROCK_AWS_ACCESS_KEY_ID', 'bedrock-akid')
      setEnv('BEDROCK_AWS_SECRET_ACCESS_KEY', 'bedrock-secret')
      setEnv('BEDROCK_AWS_SESSION_TOKEN', undefined)
      setEnv('AWS_SESSION_TOKEN', 'unrelated-oidc-session-token')

      expect(getBedrockCredentials()).toEqual({
        accessKeyId: 'bedrock-akid',
        secretAccessKey: 'bedrock-secret',
      })
    })

    it('does not pair Firehose-specific keys with an unrelated global AWS_SESSION_TOKEN', () => {
      setEnv('FIREHOSE_AWS_ACCESS_KEY_ID', 'firehose-akid')
      setEnv('FIREHOSE_AWS_SECRET_ACCESS_KEY', 'firehose-secret')
      setEnv('FIREHOSE_AWS_SESSION_TOKEN', undefined)
      setEnv('AWS_SESSION_TOKEN', 'unrelated-oidc-session-token')

      expect(getFirehoseCredentials()).toEqual({
        accessKeyId: 'firehose-akid',
        secretAccessKey: 'firehose-secret',
      })
    })

    it('omits sessionToken when only long-lived IAM credentials are present', () => {
      setEnv('AWS_ACCESS_KEY_ID', 'iam-akid')
      setEnv('AWS_SECRET_ACCESS_KEY', 'iam-secret')
      setEnv('AWS_SESSION_TOKEN', undefined)

      expect(getS3Credentials()).toEqual({
        accessKeyId: 'iam-akid',
        secretAccessKey: 'iam-secret',
      })
    })
  })
})
