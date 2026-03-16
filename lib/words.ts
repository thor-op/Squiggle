// Only safe, non-secret utilities live here — this file is bundled client-side.

export function getWordMask(word: string): string {
  return word.replace(/[a-zA-Z]/g, '_');
}
