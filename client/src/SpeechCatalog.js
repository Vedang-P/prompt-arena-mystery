export const normalizeSpeech = text => String(text).normalize('NFKC').replace(/\s+/g, ' ').trim();
// Keep the transcript/key unchanged. Punctuation is a pause, never a word to read.
export const spokenText = text => normalizeSpeech(text)
  .replace(/\s*[—–]\s*/g, ', ')
  .replace(/\s+-\s+/g, ', ')
  .replace(/…|\.{3,}/g, '. ')
  .replace(/[,.;:]\s*[,.;:]+/g, ',')
  .replace(/\s+([,.!?])/g, '$1')
  .replace(/\s+/g, ' ').trim();
export function speechKey(character, text) {
  let hash=2166136261;
  for(const letter of `${character}:${normalizeSpeech(text)}`) { hash^=letter.codePointAt(0);hash=Math.imul(hash,16777619); }
  return (hash>>>0).toString(16).padStart(8,'0');
}
