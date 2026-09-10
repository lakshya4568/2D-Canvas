import { handleInstantiate } from "../../../../../../lib/io/restHandlers";

/** POST /api/v1/templates/{id}/instantiate — UPCE-MASTER-1.0 §69. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty body means "instantiate at declared defaults".
  }
  const result = handleInstantiate(id, body);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}
