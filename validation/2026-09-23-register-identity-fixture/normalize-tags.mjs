export function normalizeTags(values) {
  if (!Array.isArray(values)) {
    throw new TypeError('values must be an array');
  }

  const result = [];
  const seen = new Set();

  for (const value of values) {
    if (typeof value !== 'string') {
      throw new TypeError('all tags must be strings');
    }

    const tag = value.trim().toLowerCase();

    if (tag && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }

  return result;
}
