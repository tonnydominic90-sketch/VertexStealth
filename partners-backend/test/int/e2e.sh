#!/bin/bash
# one-shot browser end-to-end: stack + site build + static server + playwright test. Everything is detached from the tool's stdout.
cd "$(dirname "$0")"; ROOT=$(cd ../..; pwd)
./up.sh >/tmp/up.log 2>&1 < /dev/null
ANON=$(node support.mjs jwt anon)
( cd /home/claude/site && PARTNER_BACKEND_LIVE=1 PARTNER_FUNCTIONS_URL=http://localhost:8001/functions/v1 PARTNER_SUPABASE_URL=http://localhost:54321 PARTNER_ADMIN_ANON_KEY=$ANON SITE_URL=http://localhost:3111 node scripts/build.js >/tmp/build.log 2>&1 )
( cd /home/claude/site && PORT=3111 EXTRA_CONNECT="http://localhost:8001 http://localhost:54321" setsid nohup node scripts/serve.js >/tmp/serve.log 2>&1 < /dev/null & )
sleep 1
timeout 150 python3 -u browser_test.py >/tmp/browser.log 2>&1 < /dev/null; echo "rc=$?" >> /tmp/browser.log
./down.sh >/dev/null 2>&1
