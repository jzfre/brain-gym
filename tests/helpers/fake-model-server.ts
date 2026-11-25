import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";

/** A local Responses/embeddings protocol fixture, not a substitute for model-quality evals. */
export async function startFakeModelServer(
  outputs: Record<string, unknown>,
  options: { beforeRespond?: (schema: string) => Promise<void> } = {}
) {
  const calls: string[] = [];
  const failNext = new Set<string>();
  const server: Server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/v1/embeddings") {
        calls.push("embedding");
        await options.beforeRespond?.("embedding");
        response.end(JSON.stringify({ object: "list", model: body.model, data: [
          { object: "embedding", index: 0, embedding: [1, ...Array(1535).fill(0)] }
        ], usage: { prompt_tokens: 1, total_tokens: 1 } }));
        return;
      }
      if (request.url !== "/v1/responses") {
        response.writeHead(404).end(JSON.stringify({ error: "unexpected endpoint" }));
        return;
      }
      const name = body.text?.format?.name;
      if (!name || !(name in outputs)) throw new Error(`Unexpected response schema: ${name}`);
      calls.push(name);
      await options.beforeRespond?.(name);
      const incomplete = failNext.delete(name);
      response.end(JSON.stringify({
        id: `resp_${randomUUID()}`, object: "response", created_at: Math.floor(Date.now() / 1000),
        status: incomplete ? "incomplete" : "completed", model: body.model,
        incomplete_details: incomplete ? { reason: "max_output_tokens" } : null,
        output: [{ id: `msg_${randomUUID()}`, type: "message", role: "assistant", status: "completed",
          content: [{ type: "output_text", text: JSON.stringify(outputs[name]), annotations: [] }] }],
        usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 }
      }));
    } catch (error) {
      response.writeHead(500).end(JSON.stringify({ error: { message: String(error) } }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture server port");
  return { url: `http://127.0.0.1:${address.port}/v1`, calls, failNext,
    close: () => new Promise<void>((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}
