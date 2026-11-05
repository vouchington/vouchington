#!/usr/bin/env bash
if [ -z "${AWS_TEST_ROLE_ARN:-}" ]; then
  echo "::error::AWS_TEST_ROLE_ARN is not set — S3 CORS guard (image-upload spec) cannot run. Configure the AWS_TEST_ROLE_ARN repository secret."
  exit 1
fi
if [ -z "${S3_BUCKET_IMAGES:-}" ]; then
  echo "::error::S3_BUCKET_IMAGES is not set — image-upload specs cannot run. Configure the S3_BUCKET_IMAGES repository secret."
  exit 1
fi
if [ -z "${S3_BUCKET_IMAGE_UPLOADS:-}" ]; then
  echo "::error::S3_BUCKET_IMAGE_UPLOADS is not set — image-upload specs cannot run. Configure the S3_BUCKET_IMAGE_UPLOADS repository secret."
  exit 1
fi
echo "S3_BUCKET_IMAGES=$S3_BUCKET_IMAGES" >> "$GITHUB_ENV"
echo "S3_BUCKET_IMAGE_UPLOADS=$S3_BUCKET_IMAGE_UPLOADS" >> "$GITHUB_ENV"
