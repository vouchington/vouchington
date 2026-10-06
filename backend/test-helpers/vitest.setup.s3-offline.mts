import { S3Client } from '@aws-sdk/client-s3'
import { installOfflineS3Send } from './s3-offline.mts'

// `deleteImageById` awaits three real DeleteObject requests inside the image storage lifecycle lock
// when a test does not stub S3. CI has no AWS credentials and no endpoint override, so the request
// reaches the public endpoint with fake keys and no SDK timeout bounds a stalled connection (the
// 30s `dsa-statement-payload.test.mts` stall). Tests that need S3 spy on `S3Client.prototype.send`,
// as the copyright evidence helpers do. Real S3 stays in the credentialed `backend-aws` project,
// which does not load this file.
installOfflineS3Send(S3Client)
