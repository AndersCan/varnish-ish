import Fastify, { FastifyReply } from "fastify";
import QuickLRU from "quick-lru";
import { consumeEsiStream } from "./consume-esi-stream.mjs";
import { getClient } from "./get-client.mjs";

import { PassThrough, Readable, pipeline } from "stream";
interface CacheEntry {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer[];
}

const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
    },
  },
  disableRequestLogging: true,
});

const cache = new QuickLRU<string, CacheEntry>({
  maxSize: 1000,
  onEviction(key, value) {
    fastify.log.info(`evicting ${key}`);
  },
});

// Run the server!
start();
async function start() {
  try {
    await fastify.listen({ port: 8000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

fastify.route({
  url: "/*",
  method: "GET",
  handler: async (request, reply) => {
    const { url, method } = request;

    const cacheKey = `${method}:${url}`;
    fastify.log.info(`Request for ${cacheKey}`);
    const cacheResult = getCache(cacheKey);
    if (cacheResult) {
      const body = Readable.from(cacheResult.body);

      return finish(
        cacheKey,
        cacheResult.statusCode,
        cacheResult.headers,
        false,
        body,
        reply
      );
    }

    let foundClient = getClient(url);

    if (!foundClient) {
      return reply
        .type("text/html")
        .header("Cache-Control", `max-age=5`)
        .code(404)
        .send(`Sorry, no match for ${url}`);
    }

    const { body, headers, statusCode, trailers } = await foundClient.request({
      path: url,
      method: "GET",
    });

    body.setEncoding("utf8");
    return finish(cacheKey, statusCode, headers, true, body, reply);
  },
});

function finish(
  cacheKey: string,
  statusCode: number,
  headers: CacheEntry["headers"],
  updateCache: boolean,
  body: Readable,
  reply: FastifyReply
) {
  // TODO: Specify list of headers to keep
  delete headers["keep-alive"];
  // TODO: content-length will cause an eternal spinner in browser
  delete headers["content-length"];

  const cacheEntry: CacheEntry = {
    statusCode: 0,
    body: [],
    headers: {},
  };
  if (updateCache) {
    cacheEntry.statusCode = statusCode;
    cacheEntry.headers = headers;
    const maxAge = _getMaxAge((headers || {})["cache-control"]);
    // TODO: The current response may be from the
    cache.set(cacheKey, cacheEntry, {
      maxAge,
    });
  }

  const cacheResponseStream = new PassThrough({
    encoding: "utf-8",
    transform(chunk, encoding, callback) {
      if (updateCache) {
        cacheEntry.body.push(chunk);
      }

      callback(null, chunk);
    },
  });

  const htmlResponseStream = new PassThrough();

  reply.code(statusCode).headers(headers).send(htmlResponseStream);

  pipeline(
    body,
    cacheResponseStream,
    consumeEsiStream,
    htmlResponseStream,
    (err) => {
      if (err) {
        fastify.log.error(err, "pipeline failed");
        return;
      }
      // TODO: Does this do anything?
      reply.raw.end();
    }
  );

  return reply;
}

function getCache(cacheKey: string) {
  return cache.get(cacheKey);
}

function _getMaxAge(cacheControl: string | string[] | undefined) {
  if (typeof cacheControl !== "string") {
    return 0;
  }
  const RE_MAX_AGE = /max-age=(\d+)/;
  const maxAge = RE_MAX_AGE.exec(cacheControl);
  return maxAge && maxAge[1] ? parseInt(maxAge[1], 10) * 1000 : 0;
}
