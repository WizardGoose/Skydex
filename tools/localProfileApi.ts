import type { ProxyOptions } from "vite";

/** The local preview relays only Skydex's existing public profile reads. */
export const localProfileApiProxy = (): Record<string, ProxyOptions> => ({
  "^/__skydex-profile/v1/hypixel/(snapshot|profiles|garden|museum)(\\?|$)": {
    target: "https://api.skydex.ca",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/__skydex-profile/, ""),
    bypass(request, response) {
      if (request.method === "GET") return;
      if (!response) return false;
      response.writeHead(405, { allow: "GET" });
      response.end();
      return request.url ?? "/";
    },
    configure(proxy) {
      proxy.on("proxyReq", (outgoing, incoming) => {
        // Do not forward local cookies, credentials, or arbitrary headers.
        for (const name of outgoing.getHeaderNames()) outgoing.removeHeader(name);
        outgoing.setHeader("host", "api.skydex.ca");
        outgoing.setHeader("accept", "application/json");
        outgoing.setHeader("origin", "http://localhost");
        const clientId = incoming.headers["x-skydex-client-id"];
        if (typeof clientId === "string") outgoing.setHeader("x-skydex-client-id", clientId);
      });
    },
  },
});
