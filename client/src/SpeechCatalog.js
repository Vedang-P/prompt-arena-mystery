export const normalizeSpeech = text => String(text).normalize('NFKC').replace(/\s+/g, ' ').trim();
export function speechKey(character, text) {
  let hash=2166136261;
  for(const letter of `${character}:${normalizeSpeech(text)}`) { hash^=letter.codePointAt(0);hash=Math.imul(hash,16777619); }
  return (hash>>>0).toString(16).padStart(8,'0');
}
