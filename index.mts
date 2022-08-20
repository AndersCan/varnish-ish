import wcmatch from "wildcard-match";
import Fastify from "fastify";
import { Client } from "undici";
import QuickLRU from "quick-lru";
import type { FastifyReply } from "fastify";

import { PassThrough, Writable, Readable, pipeline } from "stream";

const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
    },
  },
  disableRequestLogging: true,
});

// URL pattern to host
// OBS: This can't go via Varnish, BUT that should not matter - Varnish will cache this response

const patterns = [
  { pattern: ["/foo"], host: "http://localhost:3000" },
  { pattern: ["/bar"], host: "http://localhost:3000" },
  {
    pattern: ["/foobar*", "/foobar*/**/*", "/foobar/**/*"],
    host: "http://localhost:3000",
  },
];

interface CacheEntry {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer[];
}

const cache = new QuickLRU<string, CacheEntry>({
  maxSize: 1000,
});

function getCompiledRoutes() {
  const isMatchFunctions: Array<(urlPath: string) => Client | undefined> = [];

  for (const { pattern, host } of patterns) {
    // const ip = await dns.lookup(host);
    const isMatch = wcmatch(pattern);
    const client = new Client(host);

    const test = (urlPath: string) => {
      fastify.log.info(`testing if ${urlPath} matches ${pattern}`);
      if (isMatch(urlPath)) {
        return client;
      }
      return undefined;
    };

    isMatchFunctions.push(test);
  }

  return isMatchFunctions;
}

const compiledRoutes = getCompiledRoutes();

fastify.route({
  url: "/*",
  method: "GET",
  handler: async (request, reply) => {
    const { url, method } = request;

    const cacheKey = `${method}:${url}`;

    const cacheResult = getCache(cacheKey);
    if (cacheResult) {
      fastify.log.info(cacheResult);
      const stream = Readable.from(cacheResult.body);
      return reply
        .code(cacheResult.statusCode)
        .headers(cacheResult.headers)
        .send(stream);
    }
    fastify.log.info(url);

    let foundClient: Client | undefined = undefined;
    for (const isMatch of compiledRoutes) {
      foundClient = isMatch(url);
      if (foundClient) {
        break;
      }
    }

    if (!foundClient) {
      return reply
        .type("text/html")
        .header("Cache-Control", `max-age=5`)
        .code(404)
        .send(`Sorry, no match for ${url}`);
    }

    fastify.log.info("got match " + url);

    const cacheEntry: CacheEntry = {
      statusCode: 0,
      body: [],
      headers: {},
    };
    // saveToCacheStream.on("data", (data: Buffer) => {
    //   cacheEntry.body.push(data);
    //   console.log("saveToCacheStream:", data.toString("utf-8"));
    // });

    const { body, headers, statusCode, trailers } = await foundClient.request({
      path: url,
      method: "GET",
    });

    fastify.log.info(`response received ${statusCode}`);
    fastify.log.info(headers, "headers");
    fastify.log.info(typeof headers);
    cacheEntry.statusCode = statusCode;
    cacheEntry.headers = headers;
    // TODO: Hack max age due shitty code :/
    const maxAge = Math.max(1000, _getMaxAge((headers || {})["cache-control"]));
    cache.set(cacheKey, cacheEntry, { maxAge });

    body.setEncoding("utf8");

    const htmlResponseStream = new PassThrough();
    reply.code(statusCode).headers(headers).send(htmlResponseStream);

    for await (const chunk of body) {
      fastify.log.info(chunk);
      cacheEntry.body.push(chunk);
      htmlResponseStream.write(chunk);
    }
    reply.raw.end();

    // writeable.on("data", (data) => {});
    // pipeline(body, saveToCacheStream, (err) => {
    //   if (err) {
    //     fastify.log.error("this did fail");
    //     fastify.log.error(err);
    //   }
    //   fastify.log.info(cache.get(cacheKey), "cached");

    //   const cacheResult = getCache(cacheKey);
    //   if (cacheResult) {
    //     fastify.log.info(cacheResult);
    //     const stream = Readable.from(cacheResult.body);
    //     return reply
    //       .code(cacheResult.statusCode)
    //       .headers(cacheResult.headers)
    //       .send(stream);
    //   } else {
    //     throw new Error("uhm... this shouldnt happen");
    //   }
    // });

    return reply;
  },
});

//<esi:include src="/bar"/>

// Run the server!
const start = async () => {
  try {
    await fastify.listen({ port: 8000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();

function getCache(cacheKey: string) {
  return cache.get(cacheKey);
}

function _getMaxAge(cacheControl: string | string[] | undefined) {
  if (typeof cacheControl !== "string") {
    return 0;
  }
  const RE_MAX_AGE = /max-age=(\d+)/;
  const maxAge = RE_MAX_AGE.exec(cacheControl);
  return maxAge && maxAge[1] ? parseInt(maxAge[1], 10) * 1000 : 1000;
}
