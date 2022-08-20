import wcmatch from "wildcard-match";
import { Client } from "undici";

// URL pattern to host
// OBS: This can't go via Varnish, BUT that should not matter - Varnish will cache this response

const patterns = [
  { pattern: ["/"], host: "http://localhost:3000" },
  { pattern: ["/foo"], host: "http://localhost:3000" },
  { pattern: ["/bar"], host: "http://localhost:3000" },
  {
    pattern: ["/foobar*", "/foobar*/**/*", "/foobar/**/*"],
    host: "http://localhost:3000",
  },
];

export const routes = getCompiledRoutes();

function getCompiledRoutes() {
  const isMatchFunctions: Array<(urlPath: string) => Client | undefined> = [];

  for (const { pattern, host } of patterns) {
    const isMatch = wcmatch(pattern);
    const client = new Client(host);

    const test = (urlPath: string) => {
      if (isMatch(urlPath)) {
        return client;
      }
      return undefined;
    };

    isMatchFunctions.push(test);
  }

  return isMatchFunctions;
}

export function getClient(url: string) {
  for (const isMatch of routes) {
    const foundClient = isMatch(url);
    if (foundClient) {
      return foundClient;
    }
  }
}
