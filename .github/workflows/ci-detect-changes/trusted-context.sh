#!/usr/bin/env bash
trusted=true
dependency_bot_test=false

if [ "$EVENT_NAME" = "pull_request" ]; then
  trusted=false
  if [ "$HEAD_REPO" = "$BASE_REPO" ]; then
    case "$ACTOR" in
      "dependabot[bot]"|"renovate[bot]")
        dependency_bot_test=true
        ;;
      *)
        trusted=true
        ;;
    esac
  fi
fi

{
  echo "trusted=$trusted"
  echo "dependency-bot-test=$dependency_bot_test"
} >> "$GITHUB_OUTPUT"
