#!/usr/bin/env bash
set -euo pipefail

if [[ -n "$REQUESTED_PROMPT" ]]; then
  if [[ "$REQUESTED_PROMPT" == /* || "$REQUESTED_PROMPT" == *".."* || "$REQUESTED_PROMPT" != docs/prompts/scheduled/*.md ]]; then
    echo "::error::prompt_file must be a relative docs/prompts/scheduled/*.md path."
    exit 1
  fi
  if [[ ! -f "$REQUESTED_PROMPT" ]]; then
    echo "::error::Prompt file does not exist: $REQUESTED_PROMPT"
    exit 1
  fi
  PROMPT_PATH="$REQUESTED_PROMPT"
else
  shopt -s nullglob
  PROMPTS=()
  for prompt in docs/prompts/scheduled/*.md; do
    [[ -f "$prompt" ]] && PROMPTS+=("$prompt")
  done
  shopt -u nullglob
  PROMPT_COUNT="${#PROMPTS[@]}"
  if [[ "$PROMPT_COUNT" -eq 0 ]]; then
    echo "::error::No prompt files found under docs/prompts/scheduled."
    exit 1
  fi

  PROMPT_INDEX="$(( (RUN_NUMBER - 1) % PROMPT_COUNT ))"
  PROMPT_PATH="${PROMPTS[$PROMPT_INDEX]}"
fi

echo "Selected prompt: $PROMPT_PATH"
if grep -Fxq '<!-- harness-scheduled-completion: issue -->' "$PROMPT_PATH"; then
  COMPLETION_MODE='issue'
else
  COMPLETION_MODE='pr'
fi
if grep -Fxq '<!-- harness-scheduled-scope: existing-issues -->' "$PROMPT_PATH"; then
  EXISTING_ISSUE_MAINTENANCE='true'
else
  EXISTING_ISSUE_MAINTENANCE='false'
fi
{
  echo "prompt_path=$PROMPT_PATH"
  echo "prompt_name=$(basename "$PROMPT_PATH")"
  echo "completion_mode=$COMPLETION_MODE"
  echo "existing_issue_maintenance=$EXISTING_ISSUE_MAINTENANCE"
} >> "$GITHUB_OUTPUT"
