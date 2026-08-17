#!/bin/sh
set -eu
while true; do
  npx tsx src/lib/jobs/worker.ts || true
  sleep 2
done &
export AVESKA_SKIP_INLINE_WORKER=1
exec npx next start --hostname 0.0.0.0
