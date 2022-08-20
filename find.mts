import { deepEqual } from "node:assert/strict";

export function findFirstEsiInclude(text: string) {
  // looking for: <esi:include src="http://example.com/1.html" />

  const searchString = "<esi:include";
  let index = 0;
  let endIndex = searchString.length;

  let startOfMatch = -1;

  for (let i = 0; i < text.length; i++) {
    const isMatch = text[i] === searchString[index];

    if (isMatch) {
      index++;
      if (index === endIndex) {
        console.log("startOfMatch", i);
        // 11 -
        startOfMatch = i + 1 - endIndex;
        break;
        // yield full match
      }
    } else {
      index = 0;
    }
  }

  // do we have a start match?
  if (startOfMatch === -1) {
    console.log(" we dont");

    // no, we dont
    return;
  }

  // We have start tag, find end
  let endSearchString = "/>";
  const endEndIndex = endSearchString.length;
  let currentEndIndex = 0;
  let endOfMatch = 0;
  for (let i = index; i < text.length; i++) {
    const isMatch = text[i] === endSearchString[currentEndIndex];

    if (isMatch) {
      currentEndIndex++;
      if (endEndIndex === currentEndIndex) {
        console.log("END MATCH in", text);
        endOfMatch = i;
        return {
          startOfMatch,
          endOfMatch,
        };
      }
    } else {
      currentEndIndex = 0;
    }
  }

  console.warn(
    "In theory, we may have a match in the next chunk (or this tag is invalid)... but we do not support multi-chunks yet :/"
  );

  return;
}

deepEqual(findFirstEsiInclude("<esi:include />"), {
  startOfMatch: 0,
  endOfMatch: 14,
});

deepEqual(findFirstEsiInclude("01234 <esi:include />"), {
  startOfMatch: 0 + 6,
  endOfMatch: 14 + 6,
});
