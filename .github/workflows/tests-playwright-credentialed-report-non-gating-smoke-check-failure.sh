#!/usr/bin/env bash
message='Credentialed Playwright checks failed. They run against real cloud resources and do not gate the web check. See docs/development/tests.md#live-provider-smoke-checks.'
echo "::warning title=Credentialed Playwright check failed::${message}"
{
  echo '### Credentialed Playwright checks failed'
  echo
  echo "${message}"
} >> "$GITHUB_STEP_SUMMARY"
