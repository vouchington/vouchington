#!/usr/bin/env bash
if [ -n "${AWS_TEST_ROLE_ARN:-}" ]; then
  echo 'has_aws=true' >> "$GITHUB_OUTPUT"
else
  echo "::warning::AWS_TEST_ROLE_ARN is not set — AWS tests will not run."
  echo 'has_aws=false' >> "$GITHUB_OUTPUT"
fi
