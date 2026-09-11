export function hasS3Credentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(findS3Credentials(env))
}

export function getS3Credentials(env: NodeJS.ProcessEnv = process.env) {
  const credentials = findS3Credentials(env)
  if (!credentials) {
    throw new Error('Missing S3 credentials')
  }

  return credentials
}

export function hasSESCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(findSESCredentials(env))
}

export function getSESCredentials(env: NodeJS.ProcessEnv = process.env) {
  const credentials = findSESCredentials(env)
  if (!credentials) {
    throw new Error('Missing SES credentials')
  }

  return credentials
}

export function hasBedrockCredentials(): boolean {
  return Boolean(findBedrockCredentials())
}

export function getBedrockCredentials() {
  const credentials = findBedrockCredentials()
  if (!credentials) {
    throw new Error('Missing Bedrock credentials')
  }

  return credentials
}

export function hasFirehoseCredentials(): boolean {
  return Boolean(findFirehoseCredentials())
}

export function getFirehoseCredentials() {
  const credentials = findFirehoseCredentials()
  if (!credentials) {
    throw new Error('Missing Firehose credentials')
  }

  return credentials
}

export function hasSqsCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(findSqsCredentials(env))
}

export function getSqsCredentials(env: NodeJS.ProcessEnv = process.env) {
  const credentials = findSqsCredentials(env)
  if (!credentials) {
    throw new Error('Missing SQS credentials')
  }

  return credentials
}

function findS3Credentials(env: NodeJS.ProcessEnv) {
  return findCredentials(
    env.S3_AWS_ACCESS_KEY_ID,
    env.AWS_ACCESS_KEY_ID,
    env.S3_AWS_SECRET_ACCESS_KEY,
    env.AWS_SECRET_ACCESS_KEY,
    env.S3_AWS_SESSION_TOKEN,
    env.AWS_SESSION_TOKEN,
  )
}

function findBedrockCredentials() {
  return findCredentials(
    process.env.BEDROCK_AWS_ACCESS_KEY_ID,
    process.env.AWS_ACCESS_KEY_ID,
    process.env.BEDROCK_AWS_SECRET_ACCESS_KEY,
    process.env.AWS_SECRET_ACCESS_KEY,
    process.env.BEDROCK_AWS_SESSION_TOKEN,
    process.env.AWS_SESSION_TOKEN,
  )
}

function findFirehoseCredentials() {
  return findCredentials(
    process.env.FIREHOSE_AWS_ACCESS_KEY_ID,
    process.env.AWS_ACCESS_KEY_ID,
    process.env.FIREHOSE_AWS_SECRET_ACCESS_KEY,
    process.env.AWS_SECRET_ACCESS_KEY,
    process.env.FIREHOSE_AWS_SESSION_TOKEN,
    process.env.AWS_SESSION_TOKEN,
  )
}

function findSESCredentials(env: NodeJS.ProcessEnv) {
  return findCredentials(
    env.SES_AWS_ACCESS_KEY_ID,
    env.AWS_ACCESS_KEY_ID,
    env.SES_AWS_SECRET_ACCESS_KEY,
    env.AWS_SECRET_ACCESS_KEY,
    env.SES_AWS_SESSION_TOKEN,
    env.AWS_SESSION_TOKEN,
  )
}

function findSqsCredentials(env: NodeJS.ProcessEnv) {
  return findCredentials(
    env.SQS_AWS_ACCESS_KEY_ID,
    env.AWS_ACCESS_KEY_ID,
    env.SQS_AWS_SECRET_ACCESS_KEY,
    env.AWS_SECRET_ACCESS_KEY,
    env.SQS_AWS_SESSION_TOKEN,
    env.AWS_SESSION_TOKEN,
  )
}

function findCredentials(
  accessKeyIdValue: string | undefined,
  fallbackAccessKeyIdValue: string | undefined,
  secretAccessKeyValue: string | undefined,
  fallbackSecretAccessKeyValue: string | undefined,
  sessionTokenValue: string | undefined,
  fallbackSessionTokenValue: string | undefined,
) {
  // Keep the session token paired with the access/secret pair it belongs to.
  // Mixing service-specific keys (e.g. S3_AWS_*) with an unrelated global
  // AWS_SESSION_TOKEN (e.g. from OIDC) yields an invalid credential tuple
  // that AWS rejects. Only fall back to the secondary pair when both halves
  // of the primary pair are missing.
  const primary = pickPair(accessKeyIdValue, secretAccessKeyValue, sessionTokenValue)
  const pair =
    primary ??
    pickPair(fallbackAccessKeyIdValue, fallbackSecretAccessKeyValue, fallbackSessionTokenValue)

  return pair
}

function pickPair(
  accessKeyIdValue: string | undefined,
  secretAccessKeyValue: string | undefined,
  sessionTokenValue: string | undefined,
) {
  const accessKeyId = getFirstNonEmptyEnvValue(accessKeyIdValue)
  const secretAccessKey = getFirstNonEmptyEnvValue(secretAccessKeyValue)
  if (!accessKeyId || !secretAccessKey) {
    return undefined
  }

  // sessionToken is required when credentials are STS temporary credentials
  // (e.g. assumed via OIDC). Long-lived IAM user credentials don't have one.
  const sessionToken = getFirstNonEmptyEnvValue(sessionTokenValue)
  return sessionToken
    ? { accessKeyId, secretAccessKey, sessionToken }
    : { accessKeyId, secretAccessKey }
}

function getFirstNonEmptyEnvValue(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalizedValue = value?.trim()
    if (normalizedValue) {
      return normalizedValue
    }
  }

  return undefined
}
