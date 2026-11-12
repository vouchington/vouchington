#!/usr/bin/env bash
# A merge queue range deliberately includes every queued entry, so a group is tested as
# main will be. A pull request is classified from its own layer, the same scope as the PR
# API file list paths-filter reads: the checked-out merge commit's first parent is the
# base tip, or on a native stack the lower layer's test merge. Do not diff against
# github.base_ref: every layer reports the stack base there, so an upper layer would be
# judged on all the lower layers' files too.
if [ "$EVENT_NAME" = "merge_group" ]; then
  CHANGED=$(git diff --name-only "$MERGE_QUEUE_BASE_SHA" "$MERGE_QUEUE_HEAD_SHA")
else
  CHANGED=$(git diff --name-only HEAD^1..HEAD)
fi
NON_DOCS=$(echo "$CHANGED" | grep -vE '\.mdx?$' || true)
TEST_FIXTURE_DOCS=$(echo "$CHANGED" | grep -E '^(\.github/workflows/(README|AGENTS)\.md|\.agents/skills/.+\.mdx?|AGENTS\.md|docs/development/(ci|reference-ci-ci-job-conditions|dependency-updates|reference-dependency-updates-supply-chain-policy)\.md|docs/checklists/github-actions\.md|docs/prompts/.+\.mdx?|docs/development/local-development/(README|reference-gemini-embeddings-local)\.md|docs/overview/architecture/backend/README\.md|backend/agents/AGENTS\.md|docs/overview/architecture/ai-agents/README\.md|docs/development/postgresql/(reference-migrations-views-and-config-driven|schema-snapshot/README)\.md|docs/development/postgresql/schema-snapshot/markdown/.+\.mdx?|docs/overview/architecture/mcp/.+|docs/overview/infrastructure/reference-deployment-ci-cd-flow\.md)$' || true)
if [ -z "$CHANGED" ]; then
  echo "docs-only=false" >> "$GITHUB_OUTPUT"
elif [ -z "$NON_DOCS" ] && [ -z "$TEST_FIXTURE_DOCS" ]; then
  echo "docs-only=true" >> "$GITHUB_OUTPUT"
else
  echo "docs-only=false" >> "$GITHUB_OUTPUT"
fi
