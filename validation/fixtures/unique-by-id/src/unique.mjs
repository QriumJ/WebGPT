export function uniqueById(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
