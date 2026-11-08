if [[ "$ESCALATE_STATE_OUTCOME" == "success" && "$ESCALATE_CONCLUSION" == "success" ]]; then
  echo "disposition=handled" >> "$GITHUB_OUTPUT"
elif [[ "$SOURCE_OUTCOME" == "success" && "$SOURCE_CURRENT" == "false" ]]; then
  echo "disposition=handled" >> "$GITHUB_OUTPUT"
elif [[ "$DECISION" == "rerun" && "$FAILED_JOBS_RERUN_OUTCOME" == "success" ]]; then
  echo "disposition=handled" >> "$GITHUB_OUTPUT"
else
  echo "disposition=unhandled" >> "$GITHUB_OUTPUT"
fi
