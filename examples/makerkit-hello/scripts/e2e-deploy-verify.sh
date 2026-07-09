#!/usr/bin/env bash
# Builds and deploys hello as a bare service (the SERVICE-root deploy path —
# LowerOptions.bundle, not a hex's bundles), then polls the deployed URL
# until it serves. State is hosted, so the URL is resolved via the Management
# API: the stack's project holds exactly one compute service, and its
# post-promote endpoint domain is the servable one (PRO-200).
# Run from examples/makerkit-hello; needs HELLO_STACK_NAME + PRISMA_SERVICE_TOKEN.
set -euo pipefail

: "${HELLO_STACK_NAME:?HELLO_STACK_NAME must be set}"

pnpm build
bun node_modules/.bin/makerkit deploy src/service.ts --name "$HELLO_STACK_NAME"

api="https://api.prisma.io/v1"
auth_header="Authorization: Bearer ${PRISMA_SERVICE_TOKEN:?PRISMA_SERVICE_TOKEN is required}"
project_id="$(curl -sS -H "$auth_header" "$api/projects?limit=100" \
  | node -e "let d='';process.stdin.on('data',(c)=>{d+=c}).on('end',()=>{const p=(JSON.parse(d).data??[]).find((x)=>x.name===process.argv[1]);console.log(p?.id??'')})" "$HELLO_STACK_NAME")"
[ -n "$project_id" ] || { echo "No project named '$HELLO_STACK_NAME' in the workspace."; exit 1; }
domain="$(curl -sS -H "$auth_header" "$api/projects/$project_id/compute-services?limit=100" \
  | node -e "let d='';process.stdin.on('data',(c)=>{d+=c}).on('end',()=>{const s=(JSON.parse(d).data??[])[0];console.log(s?.serviceEndpointDomain??'')})")"
[ -n "$domain" ] || { echo "Project $project_id has no compute service with an endpoint domain."; exit 1; }
case "$domain" in
  http://*|https://*) url="$domain" ;;
  *) url="https://$domain/" ;;
esac
echo "Hello URL: $url"

deadline=$((SECONDS + 180))
body=""
while [ "$SECONDS" -lt "$deadline" ]; do
  body="$(curl -sS --max-time 30 "$url" || true)"
  if printf '%s' "$body" | grep -q '"ok"'; then
    echo "Hello serves: $body"
    exit 0
  fi
  sleep 6
done
echo "hello never served; last body: $body"
exit 1
