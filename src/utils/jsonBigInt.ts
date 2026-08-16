/** True when a JSON integer literal cannot round-trip through a JS number. */
function isLossyInteger(token: string): boolean {
  return /^-?\d+$/.test(token) && String(Number(token)) !== token;
}

/**
 * Quote unsafe integer literals before JSON.parse without touching strings.
 * PostgREST emits NUMERIC values as bare JSON numbers, including token totals
 * far beyond Number.MAX_SAFE_INTEGER.
 */
export function quoteUnsafeIntegers(json: string): string {
  let output = '';
  let index = 0;
  let inString = false;

  while (index < json.length) {
    const character = json[index];

    if (inString) {
      output += character;
      if (character === '\\') {
        index += 1;
        if (index < json.length) output += json[index];
      } else if (character === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (character === '"') {
      inString = true;
      output += character;
      index += 1;
      continue;
    }

    if (character === '-' || (character !== undefined && character >= '0' && character <= '9')) {
      let end = index;
      while (end < json.length && /[-+.eE0-9]/.test(json[end] ?? '')) end += 1;
      const token = json.slice(index, end);
      output += isLossyInteger(token) ? `"${token}"` : token;
      index = end;
      continue;
    }

    output += character;
    index += 1;
  }

  return output;
}
