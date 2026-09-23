export function normalizeTags(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("values must be an array");
  }

  const seen = new Set();
  const normalized = [];

  for (const value of values) {
    if (typeof value !== "string") {
      throw new TypeError("all values must be strings");
    }

    const tag = value.trim().toLowerCase();
    if (tag === "" || seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    normalized.push(tag);
  }

  return normalized;
}
