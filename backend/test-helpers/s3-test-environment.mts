// Config-time fixture setup also precedes globalSetup and credentialed SDK project imports.
const buckets = {
  S3_BUCKET_IMAGES: 'test-images',
  S3_BUCKET_IMAGE_UPLOADS: 'test-image-uploads',
  S3_BUCKET_SITEMAPS: 'test-sitemaps',
  S3_BUCKET_RENDERS: 'test-renders',
  S3_BUCKET_ASSETS: 'test-assets',
  S3_BUCKET_CRAWLS: 'test-crawls',
  S3_BUCKET_USER_EXPORTS: 'test-user-exports',
  S3_BUCKET_QUARANTINE: 'test-quarantine',
  S3_BUCKET_BEDROCK_BATCH: 'test-bedrock-batch',
}

for (const [name, value] of Object.entries(buckets)) {
  if (!process.env[name]?.trim()) process.env[name] = value
}

/** Only SDK-mocked projects install synthetic credentials; credentialed projects keep their gate. */
export function installS3TestCredentials(): () => void {
  const hasServiceCredentials =
    process.env.S3_AWS_ACCESS_KEY_ID?.trim() && process.env.S3_AWS_SECRET_ACCESS_KEY?.trim()
  const hasSharedCredentials =
    process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim()

  if (hasServiceCredentials || hasSharedCredentials) return () => {}

  const keys = ['S3_AWS_ACCESS_KEY_ID', 'S3_AWS_SECRET_ACCESS_KEY', 'S3_AWS_SESSION_TOKEN'] as const
  const previous = keys.map(key => process.env[key])
  process.env.S3_AWS_ACCESS_KEY_ID = 'test-s3-access-key-id'
  process.env.S3_AWS_SECRET_ACCESS_KEY = 'test-s3-secret-access-key'
  // A partial service tuple's session token must never be paired with synthetic keys.
  process.env.S3_AWS_SESSION_TOKEN = ''

  return () => {
    for (const [index, key] of keys.entries()) {
      const value = previous[index]
      if (value === undefined) {
        // oxlint-disable-next-line no-mistakes/no-delete-property, typescript/no-dynamic-delete -- restore the exact fixture-owned environment snapshot
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}
