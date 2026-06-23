// Estimate reading time from a Markdown source string. 200 wpm is the usual
// prose baseline; we round to whole minutes and never report less than one.
export function readingTime(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
