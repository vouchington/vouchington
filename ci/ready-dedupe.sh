#!/usr/bin/env bash

set -e -o pipefail

duplicate=false
skip_producers=false
skip_expensive=false
skip_settled=false
labels_json='[]'
has_playwright_full=false
has_vitest_full=false
is_draft=false
reused_run_id=''
reused_producers_json='[]'

if [ "$EVENT_NAME" = "pull_request" ] && [ -n "$PR_NUMBER" ]; then
  if fetched_pr=$(gh api --method GET "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER"); then
    if labels_json=$(jq -ce '[.labels[].name] | sort' <<< "$fetched_pr"); then
      if jq -e 'index("playwright:full") != null' >/dev/null <<< "$labels_json"; then
        has_playwright_full=true
      fi
      if jq -e 'index("vitest:full") != null' >/dev/null <<< "$labels_json"; then
        has_vitest_full=true
      fi
      draft_value=$(jq -r '.draft' <<< "$fetched_pr")
      if [ "$draft_value" = "true" ]; then
        is_draft=true
      elif [ "$draft_value" != "false" ]; then
        echo "::warning::Live PR draft field was malformed; failing open to expensive jobs."
        is_draft=false
      fi
    else
      echo "::warning::Live PR labels were malformed; failing open to both full suites."
      labels_json='["playwright:full","vitest:full"]'
      has_playwright_full=true
      has_vitest_full=true
      is_draft=false
    fi
  else
    echo "::warning::Could not read live PR labels; failing open to both full suites."
    labels_json='["playwright:full","vitest:full"]'
    has_playwright_full=true
    has_vitest_full=true
    is_draft=false
  fi
fi

if [ "$EVENT_NAME" = "pull_request" ] &&
  [ "$EVENT_ACTION" != "ready_for_review" ] &&
  [ "$is_draft" = "true" ] &&
  [ "$has_playwright_full" != "true" ] &&
  [ "$has_vitest_full" != "true" ]; then
  skip_expensive=true
  echo "Deferring expensive CI jobs because PR #$PR_NUMBER is a draft."
fi

if [ "$EVENT_NAME" = "pull_request" ] &&
  [ "$EVENT_ACTION" = "ready_for_review" ] &&
  [ -n "$PR_NUMBER" ] &&
  [ -n "$TESTED_SHA" ] &&
  [ "$has_playwright_full" != "true" ] &&
  [ "$has_vitest_full" != "true" ]; then
  if artifacts_json=$(gh api --method GET "repos/$GITHUB_REPOSITORY/actions/artifacts?name=ci-state-$TESTED_SHA"); then
    if selected_artifact=$(jq -ce '[.artifacts[]? | select(.expired == false)] | sort_by(.created_at) | last // empty' <<< "$artifacts_json") &&
      [ -n "$selected_artifact" ]; then
      artifact_id=$(jq -r '.id // empty' <<< "$selected_artifact")
      reused_run_id=$(jq -r '.workflow_run.id // empty' <<< "$selected_artifact")
      if state_archive=$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/ci-state.XXXXXX"); then
        trap 'rm -f "$state_archive"' EXIT
        if [[ "$artifact_id" =~ ^[0-9]+$ ]] &&
          [[ "$reused_run_id" =~ ^[0-9]+$ ]] &&
          [[ "$RUN_ID" =~ ^[0-9]+$ ]] &&
          prior_runs_pages=$(gh api --paginate --slurp --method GET "repos/$GITHUB_REPOSITORY/actions/workflows/ci.yml/runs?event=pull_request&head_sha=$HEAD_SHA&per_page=100") &&
          newest_prior_run_id=$(jq -r --arg current "$RUN_ID" --arg head "$HEAD_SHA" --arg pr "$PR_NUMBER" '
            [.[]? | .workflow_runs[]?
              | select((.id | tostring) != $current)
              | select(.head_sha == $head)
              | select(any(.pull_requests[]?; (.number | tostring) == $pr))]
            | sort_by(.created_at)
            | last
            | (.id | tostring) // empty
          ' <<< "$prior_runs_pages") &&
          [ "$newest_prior_run_id" = "$reused_run_id" ] &&
          origin_run_json=$(gh api --method GET "repos/$GITHUB_REPOSITORY/actions/runs/$reused_run_id") &&
          jq -e --arg run "$reused_run_id" --arg head "$HEAD_SHA" --argjson pr "$PR_NUMBER" '
            (.id | tostring) == $run and
            .name == "CI" and
            .path == ".github/workflows/ci.yml" and
            .event == "pull_request" and
            .status == "completed" and
            .conclusion == "success" and
            .head_sha == $head and
            any(.pull_requests[]?; .number == $pr)
          ' >/dev/null <<< "$origin_run_json" &&
          gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$artifact_id/zip" >"$state_archive" &&
          state_json=$(python3 -c 'import sys, zipfile; sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("ci-state.json").decode())' "$state_archive"); then
          if jq -e --arg head "$HEAD_SHA" --arg tested "$TESTED_SHA" --argjson pr "$PR_NUMBER" '
            type == "object" and
            .version == "ci-state:v1" and
            .headSha == $head and
            .testedSha == $tested and
            .prNumber == $pr and
            .processingResult == "success" and
            (.deferred | type) == "boolean" and
            (.producers | type) == "object" and
            all(.producers | keys[]; test("^[a-z0-9][a-z0-9-]*$")) and
            all(.producers[]; . == "success" or . == "skipped" or . == "failure" or . == "cancelled")
          ' >/dev/null <<< "$state_json"; then
            if jq -e 'all(.producers[]; . != "failure" and . != "cancelled")' >/dev/null <<< "$state_json"; then
              if [ "$(jq -r '.deferred' <<< "$state_json")" = "true" ]; then
                skip_settled=true
                reused_producers_json=$(jq -ce '[.producers | to_entries[] | select(.value == "success") | .key] | sort' <<< "$state_json")
                echo "ready_for_review reuses producer results from draft CI run $reused_run_id for PR #$PR_NUMBER; running expensive jobs."
              else
                duplicate=true
                echo "ready_for_review duplicates recorded full CI run $reused_run_id for PR #$PR_NUMBER at $HEAD_SHA with tested merge $TESTED_SHA."
              fi
            else
              echo "::warning::Recorded CI state includes failed or cancelled producers; running full suite."
              reused_run_id=''
            fi
          else
            echo "::warning::Recorded CI state was malformed or did not match this PR; running full suite."
            reused_run_id=''
          fi
        else
          echo "::warning::Recorded CI state is not from the newest prior CI run or could not be read; running full suite."
          reused_run_id=''
        fi
      else
        echo "::warning::Could not allocate temporary storage for recorded CI state; running full suite."
        reused_run_id=''
      fi
    else
      echo "::warning::No unexpired recorded CI state was found; running full suite."
    fi
  else
    echo "::warning::Could not list recorded CI state; running full suite."
  fi
elif [ "$EVENT_NAME" = "pull_request" ] &&
  [ "$EVENT_ACTION" = "ready_for_review" ] &&
  [ "$has_playwright_full" = "true" ]; then
  echo "Skipping ready_for_review dedupe because the playwright:full label requests a fresh full Playwright suite."
fi

if [ "$EVENT_NAME" = "pull_request" ] &&
  [ "$EVENT_ACTION" = "ready_for_review" ] &&
  [ "$has_vitest_full" = "true" ]; then
  echo "Skipping ready_for_review dedupe because the vitest:full label requests a fresh full Vitest suite."
fi

if [ "$duplicate" = "true" ]; then
  skip_producers=true
fi
{
  echo "skip-ci-producers=$skip_producers"
  echo "skip-expensive-jobs=$skip_expensive"
  echo "skip-settled-producers=$skip_settled"
  echo "pr-labels-json=$labels_json"
  echo "has-playwright-full=$has_playwright_full"
  echo "has-vitest-full=$has_vitest_full"
  echo "reused-run-id=$reused_run_id"
  echo "reused-producers-json=$reused_producers_json"
} >> "$GITHUB_OUTPUT"
