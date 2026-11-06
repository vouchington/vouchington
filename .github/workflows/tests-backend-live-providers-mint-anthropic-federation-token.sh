#!/usr/bin/env bash
set -euo pipefail
# integrity-check: skip reason=oidc-audience-literal-is-not-the-download
oidc_response=$(curl -sS --fail-with-body \
  -H "Authorization: Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
  "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=https://api.anthropic.com")
oidc_token=$(jq -er .value <<<"$oidc_response")
echo "::add-mask::${oidc_token}"
exchange_body=$(jq -n \
  --arg assertion "$oidc_token" \
  --arg federation_rule_id "$ANTHROPIC_FEDERATION_RULE_ID" \
  --arg organization_id "$ANTHROPIC_ORGANIZATION_ID" \
  --arg service_account_id "$ANTHROPIC_SERVICE_ACCOUNT_ID" \
  --arg workspace_id "$ANTHROPIC_WORKSPACE_ID" \
  '{grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", $assertion, $federation_rule_id, $organization_id, $service_account_id, $workspace_id}')
# integrity-check: skip reason=authenticated-token-exchange-not-an-artifact-download
exchange_response=$(curl -sS --fail-with-body https://api.anthropic.com/v1/oauth/token \
  -H 'content-type: application/json' -d "$exchange_body")
access_token=$(jq -er .access_token <<<"$exchange_response")
echo "::add-mask::${access_token}"
echo "ANTHROPIC_AUTH_TOKEN=${access_token}" >> "$GITHUB_ENV"
