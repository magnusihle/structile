import { createServer } from "node:http";
import { connect } from "node:net";

type Dependency = Readonly<{ name: string; host: string; port: number }>;

const dependencies: readonly Dependency[] = [
  {
    name: "postgres",
    host: process.env.STRUCTILE_POSTGRES_HOST ?? "postgres",
    port: Number(process.env.STRUCTILE_POSTGRES_PORT ?? "5432")
  },
  {
    name: "redis",
    host: process.env.STRUCTILE_REDIS_HOST ?? "redis",
    port: Number(process.env.STRUCTILE_REDIS_PORT ?? "6379")
  }
];

function reachable(dependency: Dependency): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: dependency.host, port: dependency.port });
    const finish = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1_000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

const server = createServer(async (request, response) => {
  if (request.url !== "/health") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"error":"not_found"}\n');
    return;
  }

  const results = await Promise.all(
    dependencies.map(async (dependency) => ({ name: dependency.name, reachable: await reachable(dependency) }))
  );
  const ready = results.every((result) => result.reachable);
  response.writeHead(ready ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(`${JSON.stringify({ ready, dependencies: results })}\n`);
});

server.listen(8080, "0.0.0.0");
