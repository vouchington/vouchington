#!/usr/bin/env bash

git diff --exit-code -- api-fixtures/v1/manifest.json api-fixtures/v1/schema-lock.json api-fixtures/v1/responses api-contracts/v1/request-contracts.json
untracked_generated_files="$(git ls-files --others --exclude-standard -- api-fixtures/v1/manifest.json api-fixtures/v1/schema-lock.json api-fixtures/v1/responses api-contracts/v1/request-contracts.json)"
if [ -n "$untracked_generated_files" ]; then
  echo "::error::Generated API fixture files are untracked:"
  printf '%s\n' "$untracked_generated_files"
  exit 1
fi
