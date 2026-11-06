#!/usr/bin/env bash
area() {
  if [ "$FULL" = true ] || { [ "$DOCS_ONLY" != true ] && { [ "$WORKFLOW_ACTION_CHANGES" = true ] || [ "$1" = true ]; }; }; then
    echo true
  else
    echo false
  fi
}
{
  echo "backend=$(area "$BACKEND")"
  echo "web=$(area "$WEB")"
  echo "cloudflare-worker=$(area "$CLOUDFLARE_WORKER")"
  echo "lambdas=$(area "$LAMBDAS")"
  echo "tooling=$(area "$TOOLING")"
  echo "i18n-route-bounds=$(area "$I18N_ROUTE_BOUNDS")"
} >> "$GITHUB_OUTPUT"
