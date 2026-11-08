if [[ "$SOURCE_CURRENT" == "true" && "$DECISION" == "dispatch" && "$HARNESS_AGENT_DISPATCH_ENABLED" == "true" ]]; then
  echo "should_dispatch=true" >> "$GITHUB_OUTPUT"
else
  echo "should_dispatch=false" >> "$GITHUB_OUTPUT"
fi
