# Profiling

[Back to Worker Performance](worker-performance.md#profiling)

Profile from the worktree root, with the worker pane stopped:

```sh
# Optional CPU profiler (macOS-friendly): cargo install samply --locked
samply record -- node --watch backend/entrypoints/worker-cpu/serve.mts

# Heap snapshot on demand: send SIGUSR2 to the worker PID
node --heapsnapshot-signal=SIGUSR2 backend/entrypoints/worker-cpu/serve.mts
# kill -SIGUSR2 <pid>  # writes Heap.<pid>.<ts>.heapsnapshot

# Live inspector for runtime debugging
node --inspect backend/entrypoints/worker-cpu/serve.mts
```

Quick OS-level checks while the worker runs:

```sh
ps -M "$(pgrep -n -f backend/entrypoints/worker-cpu/serve.mts)" | wc -l   # thread count
ps -o rss= -p "$(pgrep -n -f backend/entrypoints/worker-cpu/serve.mts)"   # RSS in KiB
```
