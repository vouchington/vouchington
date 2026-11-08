if [[ "$DECISION" == "rerun" && "$RUN_ATTEMPT" -lt 3 ]]; then
  echo "retry_pending=true" >> "$GITHUB_OUTPUT"
else
  echo "retry_pending=false" >> "$GITHUB_OUTPUT"
fi
