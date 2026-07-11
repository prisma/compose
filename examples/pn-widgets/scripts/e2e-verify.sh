#!/usr/bin/env bash
# Resolves the pn-widgets service's deployed URL via the Management API (state
# is hosted, not local files), then polls it until the endpoint returns
# {"ok":true,...} — proving a live round trip through the Prisma Next typed
# client: each request inserts a Widget and reads it back through the contract's
# schema (the schema the deploy migrated the DB to). Retries because a version
# cold-starts after deploy and a Prisma Postgres connection can transiently fail
# right after idle, recovering on the next hit. Run from examples/pn-widgets.
# Requires PRISMA_SERVICE_TOKEN; PN_WIDGETS_STACK_NAME optionally overrides the
# project name (defaults to pn-widgets, matching the stack name the CLI deploys).
set -euo pipefail

stack="${PN_WIDGETS_STACK_NAME:-pn-widgets}"
api="https://api.prisma.io/v1"
auth_header="Authorization: Bearer ${PRISMA_SERVICE_TOKEN:?PRISMA_SERVICE_TOKEN is required}"

project_id="$(curl -sS -H "$auth_header" "$api/projects?limit=100" \
  | node -e "let d='';process.stdin.on('data',(c)=>{d+=c}).on('end',()=>{const p=(JSON.parse(d).data??[]).find((x)=>x.name===process.argv[1]);console.log(p?.id??'')})" "$stack")"
[ -n "$project_id" ] || { echo "No project named '$stack' in the workspace."; exit 1; }

# The post-promote endpoint domain is the servable one (the create-time domain
# is a placeholder); by the time this script runs, deploy + promote have
# completed, so the service read returns the real domain.
domain="$(curl -sS -H "$auth_header" "$api/projects/$project_id/compute-services?limit=100" \
  | node -e "let d='';process.stdin.on('data',(c)=>{d+=c}).on('end',()=>{const s=(JSON.parse(d).data??[]).find((x)=>x.name==='widgets');console.log(s?.serviceEndpointDomain??'')})")"
[ -n "$domain" ] || { echo "Project $project_id has no 'widgets' compute service with an endpoint domain."; exit 1; }
# serviceEndpointDomain may arrive WITH the https:// scheme; tolerate either.
case "$domain" in
  http://*|https://*) url="$domain" ;;
  *) url="https://$domain/" ;;
esac
echo "pn-widgets URL: $url"

deadline=$((SECONDS + 180))
body=""
while [ "$SECONDS" -lt "$deadline" ]; do
  body="$(curl -sS --max-time 30 "$url" || true)"
  if printf '%s' "$body" | grep -q '"ok":true'; then
    echo "Round trip OK — the typed Prisma Next client inserted + read a Widget:"
    printf '%s\n' "$body"
    exit 0
  fi
  sleep 6
done
echo "Round trip never returned {\"ok\":true} within the deadline. Last body:"
printf '%s' "$body" | head -c 3000
exit 1
