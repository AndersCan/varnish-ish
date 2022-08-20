// Require the framework and instantiate it
import app from "fastify";

const fastify = app({ logger: true, disableRequestLogging: true });

function random() {
  return `${Math.random()}`.slice(2, 6);
}
// Declare a route
fastify.get("/", async (request, reply) => {
  const result = `<html><h1> root ${random()}</h1><esi:include src="/foo"/></html>`;
  fastify.log.info(request.url);
  return reply
    .type("text/html")
    .header("Cache-Control", `max-age=${2}`)
    .code(200)
    .send(result);
});

fastify.get("/foo", async (request, reply) => {
  fastify.log.info(request.url);
  return reply
    .type("text/html")
    .header("Cache-Control", `public, max-age=${6}`)
    .code(200).send(`<h2> foo ${random()}</h2>
    <esi:include src="/bar"/>`);
});

fastify.get("/bar", async (request, reply) => {
  fastify.log.info(request.url);
  return reply
    .type("text/html")
    .header("Cache-Control", `public, max-age=${3}`)
    .code(200).send(`<h2> bar ${random()}</h2>
    <esi:include src="/foobar"/>
    `);
});

fastify.get("/foobar*", async (request, reply) => {
  fastify.log.info(request.url);
  return reply
    .type("text/html")
    .header("Cache-Control", `public, max-age=${0}`)
    .code(200)
    .send(
      `<h3> foobar for ${
        request.url
      } - ${random()}</h3><p> Obs: Denne har max-age satt til 0</p>`
    );
});

// Run the server!
const start = async () => {
  try {
    console.log("starting...");
    await fastify.listen({ host: "0.0.0.0", port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
