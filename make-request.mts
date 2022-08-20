import { Client, request } from "undici";

// TODO Add Result to Cache
export async function* makeRequest(url) {
  const { body, headers, statusCode, trailers } = await request(url, {
    method: "GET",
  });

  // TODO Handle error: Emit html comment?
  for await (const chunk of body) {
    yield chunk;
  }
}
