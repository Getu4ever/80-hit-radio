/** Turn raw headlines into a ~30-second luxury radio bulletin script. */
export function buildNewsScript(headlines: string[]): string {
  const cleaned = headlines
    .map((line) =>
      line
        .replace(/\s+/g, " ")
        .replace(/["']/g, "")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 3);

  if (cleaned.length === 0) {
    return (
      "You're listening to RithmGen eighty hit radio. " +
      "Our news desk is standing by — we'll return to the classics in just a moment."
    );
  }

  const lead = cleaned[0];
  const middle = cleaned[1];
  const tail = cleaned[2];

  let body = `First, ${lead}.`;
  if (middle) body += ` Also making headlines: ${middle}.`;
  if (tail) body += ` And finally, ${tail}.`;

  return (
    "This is RithmGen News on eighty hit radio. " +
    "Here are today's top stories from around the world. " +
    body +
    " That wraps your bulletin. We return to the hits, right after this."
  );
}
