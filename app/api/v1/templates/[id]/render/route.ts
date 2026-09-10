import { handleRender } from "../../../../../../lib/io/restHandlers";

/** POST /api/v1/templates/{id}/render — UPCE-MASTER-1.0 §69. Returns binary. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty body renders at declared defaults, as DXF.
  }
  const result = handleRender(id, body);
  if (result.body instanceof Uint8Array) {
    return new Response(result.body as BodyInit, {
      status: result.status,
      headers: result.headers,
    });
  }
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}
