export function pageWithinRange(page, itemCount, pageSize) {
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(itemCount / pageSize)));
}
