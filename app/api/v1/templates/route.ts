import { handleListTemplates } from "../../../../lib/io/restHandlers";

/** GET /api/v1/templates?query= — UPCE-MASTER-1.0 §69 catalogue endpoint. */
export function GET(request: Request): Response {
  const query = new URL(request.url).searchParams.get("query") ?? undefined;
  const result = handleListTemplates(query);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}
