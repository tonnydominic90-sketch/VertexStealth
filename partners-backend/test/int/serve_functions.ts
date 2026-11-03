// Test harness only: serves the four functions on one port at /functions/v1/<name>
import { handle as apply } from "../../supabase/functions/partner-apply/index.ts";
import { handle as click } from "../../supabase/functions/partner-click/index.ts";
import { handle as review } from "../../supabase/functions/partner-admin-review/index.ts";
import { handle as portal } from "../../supabase/functions/partner-portal/index.ts";
const routes: Record<string, (r: Request) => Promise<Response>> = {
  "partner-apply": apply, "partner-click": click, "partner-admin-review": review, "partner-portal": portal,
};
Deno.serve({ port: Number(Deno.env.get("FN_PORT") ?? 8001) }, (req) => {
  const name = new URL(req.url).pathname.split("/").pop() ?? "";
  return routes[name] ? routes[name](req) : Promise.resolve(new Response("not found", { status: 404 }));
});
