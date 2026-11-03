#!/bin/bash
# Start the whole test stack and leave it running (use down.sh to stop). Used by run.sh and the browser test.
cd "$(dirname "$0")"; ROOT=$(cd ../..; pwd); export PGPASSWORD=pw
/tmp/pgstart.sh
su postgres -c "psql -qc 'drop database if exists vs_test' -c 'create database vs_test'" >/dev/null 2>&1
psql -h localhost -U postgres -d vs_test -q -v ON_ERROR_STOP=1 -f ../stub.sql -f $ROOT/supabase/partner-program.sql 2>&1 | grep -v NOTICE
./down.sh
export TEST_ADMIN_ID=${TEST_ADMIN_ID:-00000000-0000-0000-0000-0000000000aa} TEST_USER_ID=${TEST_USER_ID:-00000000-0000-0000-0000-0000000000bb}
psql -h localhost -U postgres -d vs_test -q -c "insert into auth.users(id,email) values ('$TEST_ADMIN_ID','admin@x.com'),('$TEST_USER_ID','user@x.com') on conflict do nothing; insert into profiles(id,email,is_admin) values ('$TEST_ADMIN_ID','admin@x.com',true),('$TEST_USER_ID','user@x.com',false) on conflict do nothing"
nohup /tmp/postgrest postgrest.conf >/tmp/pgrst.log 2>&1 &
nohup node support.mjs >/tmp/support.log 2>&1 &
export SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=$(node support.mjs jwt service_role) SUPABASE_ANON_KEY=$(node support.mjs jwt anon)
export SITE_URL=https://vertexstealth.vercel.app ALLOWED_ORIGINS=https://vertexstealth.vercel.app,http://localhost:3111 PORTAL_URL=http://localhost:3111/partner RESEND_API_KEY=test-key RESEND_API_URL=http://localhost:3999/emails ADMIN_NOTIFY_EMAIL=admin@vertexstealth.test PARTNER_IP_SALT=salt FN_PORT=8001
(cd $ROOT && nohup /tmp/denoinst/node_modules/.bin/deno run --allow-net --allow-env --allow-read test/int/serve_functions.ts >/tmp/fn.log 2>&1 &)
for i in $(seq 1 40); do curl -s -o /dev/null localhost:3000/ && curl -s -o /dev/null -X OPTIONS localhost:8001/functions/v1/partner-apply && break; sleep 1; done
echo "stack up"
