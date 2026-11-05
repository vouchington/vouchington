#!/usr/bin/env bash
case "$SOURCE_WORKFLOW_PATH" in
  .github/workflows/docs-publish.yml)
    echo 'source_workflow=docs-publish' >> "$GITHUB_OUTPUT"
    echo 'event_type=vouchington-publish-docs-v2' >> "$GITHUB_OUTPUT"
    ;;
  .github/workflows/main-backend.yml)
    echo 'source_workflow=main-backend' >> "$GITHUB_OUTPUT"
    echo 'event_type=vouchington-deploy-backend-v2' >> "$GITHUB_OUTPUT"
    ;;
  .github/workflows/main-cloudflare-worker.yml)
    echo 'source_workflow=main-cloudflare-worker' >> "$GITHUB_OUTPUT"
    echo 'event_type=vouchington-deploy-cloudflare-worker-v2' >> "$GITHUB_OUTPUT"
    ;;
  .github/workflows/main-lambdas.yml)
    echo 'source_workflow=main-lambdas' >> "$GITHUB_OUTPUT"
    echo 'event_type=vouchington-deploy-lambdas-v2' >> "$GITHUB_OUTPUT"
    ;;
  .github/workflows/main-storybook.yml)
    echo 'source_workflow=main-storybook' >> "$GITHUB_OUTPUT"
    echo 'event_type=vouchington-publish-storybook-v2' >> "$GITHUB_OUTPUT"
    ;;
  .github/workflows/main-web.yml)
    echo 'source_workflow=main-web' >> "$GITHUB_OUTPUT"
    echo 'event_type=vouchington-deploy-web-v2' >> "$GITHUB_OUTPUT"
    ;;
  .github/workflows/sync-articles.yml)
    echo 'source_workflow=sync-articles' >> "$GITHUB_OUTPUT"
    echo 'event_type=vouchington-publish-articles-v2' >> "$GITHUB_OUTPUT"
    ;;
  *) echo '::error::Unexpected source workflow path.'; exit 1 ;;
esac
