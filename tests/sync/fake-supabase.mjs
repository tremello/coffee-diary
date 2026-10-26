// A stand-in for the coffee_data table behind Supabase's REST API: rows keyed by (user_id, key) with the
// version column the database bumps on every write, and read/write delays so two devices can be made to read
// the same old value before either saves. `versionColumn: false` behaves like a database without the column.
import { createServer } from "node:http";

export async function startFakeSupabase() {
  const rows = new Map();
  const id = (userId, key) => `${userId}\u0000${key}`;
  const state = { readDelay: 0, writeDelay: 0, versionColumn: true };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    if (!url.pathname.endsWith("/rest/v1/coffee_data")) return send(404, { message: "unknown path" });
    const eq = name => url.searchParams.get(name)?.replace(/^eq\./, "");
    const columns = (url.searchParams.get("select") ?? "").split(",").map(column => column.trim()).filter(Boolean);
    if (!state.versionColumn && (columns.includes("version") || url.searchParams.has("version"))) {
      return send(400, { code: "42703", message: "column coffee_data.version does not exist" });
    }
    const pick = row => Object.fromEntries(columns.map(column => [column, structuredClone(row[column])]));
    const write = (row, data) => { row.data = data; if (state.versionColumn) row.version = (row.version ?? 0) + 1; };
    let body = "";
    for await (const chunk of req) body += chunk;
    if (req.method === "GET") {
      const row = rows.get(id(eq("user_id"), eq("key")));
      const snapshot = row ? [pick(row)] : [];
      await new Promise(resolve => setTimeout(resolve, state.readDelay));
      return send(200, snapshot);
    }
    if (req.method === "POST") {
      for (const { user_id, key, data } of [JSON.parse(body)].flat()) {
        const row = rows.get(id(user_id, key)) ?? { version: state.versionColumn ? 0 : undefined };
        write(row, data);
        rows.set(id(user_id, key), row);
      }
      return send(201);
    }
    if (req.method === "PATCH") {
      await new Promise(resolve => setTimeout(resolve, state.writeDelay));
      const row = rows.get(id(eq("user_id"), eq("key")));
      const matches = row && (!url.searchParams.has("version") || String(row.version) === eq("version"));
      if (matches) write(row, JSON.parse(body).data);
      return send(200, matches ? [pick(row)] : []);
    }
    send(405, { message: "method not allowed" });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    state,
    get: (userId, key) => structuredClone(rows.get(id(userId, key))?.data),
    set: (userId, key, data) => rows.set(id(userId, key), { data: structuredClone(data), version: state.versionColumn ? 1 : undefined }),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}
