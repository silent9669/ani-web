function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Providers frequently return a generic title such as "Episode 1163" in the
 * episode-title field. Remove that redundant prefix so compact UI labels do
 * not repeat the same metadata and cover subtitle-safe space in the player.
 */
export function episodeTitleDetail(title: string | null | undefined, episodeNumber: number) {
  let detail = title?.trim().replace(/\s+/g, " ") ?? "";
  if (!detail) return null;

  const number = escapeRegExp(String(episodeNumber));
  const generic = new RegExp(
    `^(?:episode|ep\\.?|e|tập|tap)\\s*0*${number}(?:\\s*[-:·/|]\\s*(.*))?$`,
    "i",
  );

  for (let pass = 0; pass < 2; pass += 1) {
    const match = detail.match(generic);
    if (!match) return detail;
    detail = match[1]?.trim() ?? "";
    if (!detail) return null;
  }

  return detail || null;
}

export function episodeLabel(
  episodeNumber: number,
  title: string | null | undefined,
  separator = " · ",
) {
  const detail = episodeTitleDetail(title, episodeNumber);
  return `Episode ${episodeNumber}${detail ? `${separator}${detail}` : ""}`;
}
