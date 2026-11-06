#!/usr/bin/env bash
message='Real AWS smoke check failed. It does not gate the backend check: recorded-response fixture tests in the unit suites gate request construction and response handling. See docs/development/tests.md#live-provider-smoke-checks.'
echo "::warning title=Live provider smoke check failed::${message}"
{
  echo '### Real AWS smoke check failed'
  echo
  echo "${message}"
} >> "$GITHUB_STEP_SUMMARY"
