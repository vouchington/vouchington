import { describe, expect, it } from 'vitest'
import {
  getBedrockCredentials,
  getFirehoseCredentials,
  getSESCredentials,
  getS3Credentials,
  getSqsCredentials,
  hasBedrockCredentials,
  hasFirehoseCredentials,
  hasSESCredentials,
  hasS3Credentials,
  hasSqsCredentials,
} from './credentials.mts'
import { setupCredentialEnv } from './credentials-test-helpers.mts'

describe('credentials', () => {
  const { setEnv } = setupCredentialEnv()

  describe('AWS credentials helpers', () => {
    it('hasS3Credentials ignores missing and whitespace-only values', () => {
      setEnv('S3_AWS_ACCESS_KEY_ID', '   ')
      setEnv('S3_AWS_SECRET_ACCESS_KEY', '')
      setEnv('AWS_ACCESS_KEY_ID', undefined)
      setEnv('AWS_SECRET_ACCESS_KEY', undefined)

      expect(hasS3Credentials()).toBe(false)
      expect(() => getS3Credentials()).toThrow('Missing S3 credentials')
    })

    it('getS3Credentials falls back to shared AWS credentials and trims values', () => {
      setEnv('S3_AWS_ACCESS_KEY_ID', '   ')
      setEnv('S3_AWS_SECRET_ACCESS_KEY', undefined)
      setEnv('AWS_ACCESS_KEY_ID', '  fallback-akid  ')
      setEnv('AWS_SECRET_ACCESS_KEY', '  fallback-secret  ')

      expect(hasS3Credentials()).toBe(true)
      expect(getS3Credentials()).toEqual({
        accessKeyId: 'fallback-akid',
        secretAccessKey: 'fallback-secret',
      })
    })

    it('getS3Credentials prefers S3-specific credentials over shared AWS credentials', () => {
      setEnv('S3_AWS_ACCESS_KEY_ID', 's3-akid')
      setEnv('S3_AWS_SECRET_ACCESS_KEY', 's3-secret')
      setEnv('AWS_ACCESS_KEY_ID', 'fallback-akid')
      setEnv('AWS_SECRET_ACCESS_KEY', 'fallback-secret')

      expect(getS3Credentials()).toEqual({
        accessKeyId: 's3-akid',
        secretAccessKey: 's3-secret',
      })
    })

    it('hasSESCredentials ignores missing and whitespace-only values', () => {
      setEnv('SES_AWS_ACCESS_KEY_ID', ' ')
      setEnv('SES_AWS_SECRET_ACCESS_KEY', '\n\t')
      setEnv('AWS_ACCESS_KEY_ID', undefined)
      setEnv('AWS_SECRET_ACCESS_KEY', undefined)

      expect(hasSESCredentials()).toBe(false)
      expect(() => getSESCredentials()).toThrow('Missing SES credentials')
    })

    it('getSESCredentials falls back to shared AWS credentials and trims values', () => {
      setEnv('SES_AWS_ACCESS_KEY_ID', undefined)
      setEnv('SES_AWS_SECRET_ACCESS_KEY', '   ')
      setEnv('AWS_ACCESS_KEY_ID', '  fallback-ses-akid ')
      setEnv('AWS_SECRET_ACCESS_KEY', '  fallback-ses-secret ')

      expect(hasSESCredentials()).toBe(true)
      expect(getSESCredentials()).toEqual({
        accessKeyId: 'fallback-ses-akid',
        secretAccessKey: 'fallback-ses-secret',
      })
    })

    it('getSESCredentials prefers SES-specific credentials over shared AWS credentials', () => {
      setEnv('SES_AWS_ACCESS_KEY_ID', 'ses-akid')
      setEnv('SES_AWS_SECRET_ACCESS_KEY', 'ses-secret')
      setEnv('AWS_ACCESS_KEY_ID', 'fallback-akid')
      setEnv('AWS_SECRET_ACCESS_KEY', 'fallback-secret')

      expect(getSESCredentials()).toEqual({
        accessKeyId: 'ses-akid',
        secretAccessKey: 'ses-secret',
      })
    })

    it('hasBedrockCredentials ignores missing and whitespace-only values', () => {
      setEnv('BEDROCK_AWS_ACCESS_KEY_ID', ' ')
      setEnv('BEDROCK_AWS_SECRET_ACCESS_KEY', '\n\t')
      setEnv('AWS_ACCESS_KEY_ID', undefined)
      setEnv('AWS_SECRET_ACCESS_KEY', undefined)

      expect(hasBedrockCredentials()).toBe(false)
      expect(() => getBedrockCredentials()).toThrow('Missing Bedrock credentials')
    })

    it('getBedrockCredentials falls back to shared AWS credentials and trims values', () => {
      setEnv('BEDROCK_AWS_ACCESS_KEY_ID', undefined)
      setEnv('BEDROCK_AWS_SECRET_ACCESS_KEY', '   ')
      setEnv('AWS_ACCESS_KEY_ID', '  fallback-bedrock-akid ')
      setEnv('AWS_SECRET_ACCESS_KEY', '  fallback-bedrock-secret ')

      expect(hasBedrockCredentials()).toBe(true)
      expect(getBedrockCredentials()).toEqual({
        accessKeyId: 'fallback-bedrock-akid',
        secretAccessKey: 'fallback-bedrock-secret',
      })
    })

    it('getBedrockCredentials prefers Bedrock-specific credentials over shared AWS credentials', () => {
      setEnv('BEDROCK_AWS_ACCESS_KEY_ID', 'bedrock-akid')
      setEnv('BEDROCK_AWS_SECRET_ACCESS_KEY', 'bedrock-secret')
      setEnv('AWS_ACCESS_KEY_ID', 'fallback-akid')
      setEnv('AWS_SECRET_ACCESS_KEY', 'fallback-secret')

      expect(getBedrockCredentials()).toEqual({
        accessKeyId: 'bedrock-akid',
        secretAccessKey: 'bedrock-secret',
      })
    })

    it('hasFirehoseCredentials ignores missing and whitespace-only values', () => {
      setEnv('FIREHOSE_AWS_ACCESS_KEY_ID', ' ')
      setEnv('FIREHOSE_AWS_SECRET_ACCESS_KEY', '\n\t')
      setEnv('AWS_ACCESS_KEY_ID', undefined)
      setEnv('AWS_SECRET_ACCESS_KEY', undefined)

      expect(hasFirehoseCredentials()).toBe(false)
      expect(() => getFirehoseCredentials()).toThrow('Missing Firehose credentials')
    })

    it('getFirehoseCredentials falls back to shared AWS credentials and trims values', () => {
      setEnv('FIREHOSE_AWS_ACCESS_KEY_ID', undefined)
      setEnv('FIREHOSE_AWS_SECRET_ACCESS_KEY', '   ')
      setEnv('AWS_ACCESS_KEY_ID', '  fallback-firehose-akid ')
      setEnv('AWS_SECRET_ACCESS_KEY', '  fallback-firehose-secret ')

      expect(hasFirehoseCredentials()).toBe(true)
      expect(getFirehoseCredentials()).toEqual({
        accessKeyId: 'fallback-firehose-akid',
        secretAccessKey: 'fallback-firehose-secret',
      })
    })

    it('getFirehoseCredentials prefers Firehose-specific credentials over shared AWS credentials', () => {
      setEnv('FIREHOSE_AWS_ACCESS_KEY_ID', 'firehose-akid')
      setEnv('FIREHOSE_AWS_SECRET_ACCESS_KEY', 'firehose-secret')
      setEnv('AWS_ACCESS_KEY_ID', 'fallback-akid')
      setEnv('AWS_SECRET_ACCESS_KEY', 'fallback-secret')

      expect(getFirehoseCredentials()).toEqual({
        accessKeyId: 'firehose-akid',
        secretAccessKey: 'firehose-secret',
      })
    })

    it('hasSqsCredentials ignores missing and whitespace-only values', () => {
      setEnv('SQS_AWS_ACCESS_KEY_ID', ' ')
      setEnv('SQS_AWS_SECRET_ACCESS_KEY', '\n\t')
      setEnv('AWS_ACCESS_KEY_ID', undefined)
      setEnv('AWS_SECRET_ACCESS_KEY', undefined)

      expect(hasSqsCredentials()).toBe(false)
      expect(() => getSqsCredentials()).toThrow('Missing SQS credentials')
    })

    it('getSqsCredentials falls back to shared AWS credentials and trims values', () => {
      setEnv('SQS_AWS_ACCESS_KEY_ID', undefined)
      setEnv('SQS_AWS_SECRET_ACCESS_KEY', '   ')
      setEnv('AWS_ACCESS_KEY_ID', '  fallback-sqs-akid ')
      setEnv('AWS_SECRET_ACCESS_KEY', '  fallback-sqs-secret ')

      expect(hasSqsCredentials()).toBe(true)
      expect(getSqsCredentials()).toEqual({
        accessKeyId: 'fallback-sqs-akid',
        secretAccessKey: 'fallback-sqs-secret',
      })
    })

    it('getSqsCredentials prefers SQS-specific credentials over shared AWS credentials', () => {
      setEnv('SQS_AWS_ACCESS_KEY_ID', 'sqs-akid')
      setEnv('SQS_AWS_SECRET_ACCESS_KEY', 'sqs-secret')
      setEnv('AWS_ACCESS_KEY_ID', 'fallback-akid')
      setEnv('AWS_SECRET_ACCESS_KEY', 'fallback-secret')

      expect(getSqsCredentials()).toEqual({
        accessKeyId: 'sqs-akid',
        secretAccessKey: 'sqs-secret',
      })
    })
  })
})
