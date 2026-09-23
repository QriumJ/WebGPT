export function normalizeTags(values) {
  if (!Array.isArray(values)) {
    throw new TypeError('values must be an array of strings');
  }

  const normalized = [];
  const seen = new Set();

  for (const value of values) {
    if (typeof value !== 'string') {
      throw new TypeError('values must contain only strings');
    }

    const tag = value.trim().toLowerCase();
    if (tag !== '' && !seen.has(tag)) {
      seen.add(tag);
      normalized.push(tag);
    }
  }

  return normalized;
}
