# Sourced by test-plan-shadow.yml. Writes Vitest and Playwright plan JSON for the pull request
# checked out in ./pr. A failed plan is a warning, never a failed job: the comparison step
# reports a missing plan as a plan error.
plans="$RUNNER_TEMP/plans"
mkdir -p "$plans"

shadow_plan() {
  local version merge_base auth framework runner
  version=$(node -p "require('./package.json').devDependencies['no-mistakes'].replace(/^[^0-9]*/, '')")
  runner="$RUNNER_TEMP/no-mistakes-$version"
  npm install --prefix "$runner" --ignore-scripts --no-audit --no-fund --no-save "no-mistakes@$version"

  # The pull request was checked out at depth 1. Fetch only its merge base, so the three-dot diff
  # below changes exactly the files the pull request changed, however far the base has moved.
  merge_base=$(gh api "repos/$GITHUB_REPOSITORY/compare/$BASE_REF...$HEAD_SHA" --jq .merge_base_commit.sha)
  auth=$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')
  echo "::add-mask::$auth"
  export GIT_CONFIG_COUNT=1
  export GIT_CONFIG_KEY_0="http.https://github.com/.extraheader"
  export GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $auth"
  cd pr
  git fetch --no-tags --depth=1 origin "$merge_base"
  git update-ref "refs/remotes/origin/$BASE_REF" "$merge_base"
  unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0

  for framework in vitest playwright; do
    "$runner/node_modules/.bin/no-mistakes" --timeout 180 --lock-timeout 0 tests plan "$framework" \
      --from-git-diff "origin/$BASE_REF...HEAD" --environment pullRequest --format json \
      > "$plans/$framework.json" || echo "::warning::$framework test plan failed"
  done
}

(shadow_plan) || echo "::warning::test plan setup failed; the comparison reports it"
