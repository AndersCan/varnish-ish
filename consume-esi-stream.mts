import { Readable } from "stream";
import { findFirstEsiInclude } from "./find.mjs";
import { makeRequest } from "./make-request.mjs";

export async function* consumeEsiStream(chunks: Readable) {
  for await (const chunk of chunks) {
    let esi = findFirstEsiInclude(chunk);

    if (esi) {
      const esiTag = chunk.slice(esi.startOfMatch, esi.endOfMatch);
      const esiSrc = getEsiSrc(esiTag);
      const start = chunk.slice(0, esi.startOfMatch);
      const end = chunk.slice(esi.endOfMatch, 0);

      console.log({ start, esiTag, end });

      yield start;
      yield `<!-- ${esiTag} -->`;
      yield* makeRequest(`http://localhost:8000${esiSrc}`);
      yield end;
    } else {
      yield chunk;
    }

    // yield chunk;
  }
}

function getEsiSrc(esiTag: string) {
  // Thanks nodesi (TODO: change implementation)
  const src =
    getDoubleQuotedSrc(esiTag) ||
    getSingleQuotedSrc(esiTag) ||
    getUnquotedSrc(esiTag);

  return src;
}

// https://github.com/Schibsted-Tech-Polska/nodesi/blob/88be34f0ef39bc56beaeff98f0e8c776e57f6934/lib/esi.js#L87
function getBoundedString(open: string, close: string) {
  return (str) => {
    const before = str.indexOf(open);
    let strFragment;
    let after;

    if (before > -1) {
      strFragment = str.substr(before + open.length);
      after = strFragment.indexOf(close);
      return strFragment.substr(0, after);
    }
    return "";
  };
}

const getDoubleQuotedSrc = getBoundedString('src="', '"');
const getSingleQuotedSrc = getBoundedString("src='", "'");
const getUnquotedSrc = getBoundedString("src=", ">");
