/**
 * Devanagari to Urdu script.
 *
 * WHY THIS EXISTS. Urdu and Hindi are one spoken language written two ways,
 * and a speech recogniser deciding which one it heard is guessing. Ours
 * guesses "Hindi" often enough that an Urdu speaker watches their own words
 * come back in Devanagari, which they may not read at all. The prompt cannot
 * fix it: the prompt governs what the model SAYS, while this text is what the
 * recogniser WROTE DOWN, and no instruction reaches that.
 *
 * WHY IT IS TRACTABLE. This direction is the easy one. Devanagari writes every
 * vowel explicitly; Urdu script omits the short ones. So a short vowel maps to
 * nothing, a long vowel maps to its letter, and consonants map one to one.
 * Going the other way would mean restoring vowels that were never written,
 * which is guesswork. This is not.
 *
 * WHAT IT IS NOT. It is a transliteration, not a translation, and not an
 * orthographic authority. Words of Arabic and Persian origin have fixed Urdu
 * spellings that Devanagari has already flattened: عید is written اید here,
 * because ई carries no record of the ع it lost. Proper Urdu also writes بتاؤ
 * where this produces بتااو. Both are readable, and readable in the right
 * script beats correct in the wrong one.
 *
 * Anything that is not Devanagari passes through untouched, so a mixed line
 * keeps its clinic names, its figures and its English.
 */

/** Consonants. The aspirates carry their own do-chashmi he. */
const CONSONANTS: Record<string, string> = {
  'क': 'ک', // क  ka  → ک
  'ख': 'کھ', // ख  kha → کھ
  'ग': 'گ', // ग  ga  → گ
  'घ': 'گھ', // घ  gha → گھ
  'ङ': 'ن', // ङ  nga → ن
  'च': 'چ', // च  ca  → چ
  'छ': 'چھ', // छ  cha → چھ
  'ज': 'ج', // ज  ja  → ج
  'झ': 'جھ', // झ  jha → جھ
  'ञ': 'ن', // ञ  nya → ن
  'ट': 'ٹ', // ट  tta → ٹ
  'ठ': 'ٹھ', // ठ  ttha→ ٹھ
  'ड': 'ڈ', // ड  dda → ڈ
  'ढ': 'ڈھ', // ढ  ddha→ ڈھ
  'ण': 'ن', // ण  nna → ن
  'त': 'ت', // त  ta  → ت
  'थ': 'تھ', // थ  tha → تھ
  'द': 'د', // द  da  → د
  'ध': 'دھ', // ध  dha → دھ
  'न': 'ن', // न  na  → ن
  'प': 'پ', // प  pa  → پ
  'फ': 'پھ', // फ  pha → پھ
  'ब': 'ب', // ब  ba  → ب
  'भ': 'بھ', // भ  bha → بھ
  'म': 'م', // म  ma  → م
  'य': 'ی', // य  ya  → ی
  'र': 'ر', // र  ra  → ر
  'ल': 'ل', // ल  la  → ل
  'ळ': 'ل', // ळ  lla → ل
  'व': 'و', // व  va  → و
  'श': 'ش', // श  sha → ش
  'ष': 'ش', // ष  ssa → ش
  'स': 'س', // स  sa  → س
  'ह': 'ہ', // ह  ha  → ہ
};

/**
 * Nukta forms. These are the letters Urdu kept from Arabic and Persian and
 * Hindi borrowed back with a dot, so they are exactly the ones an Urdu reader
 * would notice missing: ज़ as ز not ج, क़ as ق not ک.
 */
const NUKTA: Record<string, string> = {
  'क़': 'ق', // क़ qa  → ق
  'ख़': 'خ', // ख़ khha→ خ
  'ग़': 'غ', // ग़ ghha→ غ
  'ज़': 'ز', // ज़ za  → ز
  'ड़': 'ڑ', // ड़ dddha→ ڑ
  'ढ़': 'ڑھ', // ढ़ rha → ڑھ
  'फ़': 'ف', // फ़ fa  → ف
  'य़': 'ی', // य़ yya → ی
};

/** The same eight, written as base + U+093C rather than precomposed. */
const NUKTA_BASE: Record<string, string> = {
  'क': 'क़',
  'ख': 'ख़',
  'ग': 'ग़',
  'ज': 'ज़',
  'ड': 'ड़',
  'ढ': 'ढ़',
  'फ': 'फ़',
  'य': 'य़',
};

/**
 * Independent vowels — the form used when a word starts with one.
 *
 * ए and ऐ both become ای and ओ/औ both become او. Urdu does not distinguish
 * them at the start of a word either, so this loses nothing: एक is ایک and
 * ऐसा is ایسا, which is what an Urdu reader expects to see.
 */
const VOWELS: Record<string, string> = {
  'अ': 'ا', // अ  a  → ا
  'आ': 'آ', // आ  aa → آ
  'इ': 'ا', // इ  i  → ا
  'ई': 'ای', // ई  ii → ای
  'उ': 'ا', // उ  u  → ا
  'ऊ': 'او', // ऊ  uu → او
  'ऋ': 'ر', // ऋ  ri → ر
  'ए': 'ای', // ए  e  → ای
  'ऐ': 'ای', // ऐ  ai → ای
  'ओ': 'او', // ओ  o  → او
  'औ': 'او', // औ  au → او
};

/**
 * Dependent vowel signs.
 *
 * The short ones map to nothing, which is the whole reason this direction
 * works: Urdu simply does not write them. कितने drops both and lands on
 * کتنے, exactly as it is spelled.
 */
const MATRAS: Record<string, string> = {
  'ा': 'ا', // ा  aa → ا
  'ि': '', // ि  i  → (not written)
  'ी': 'ی', // ी  ii → ی
  'ु': '', // ु  u  → (not written)
  'ू': 'و', // ू  uu → و
  'ृ': 'ر', // ृ  ri → ر
  'े': 'ے', // े  e  → ے
  'ै': 'ے', // ै  ai → ے
  'ो': 'و', // ो  o  → و
  'ौ': 'و', // ौ  au → و
};

/** Marks, digits and the punctuation that only appears in this script. */
const MARKS: Record<string, string> = {
  'ऀ': 'ں', // ऀ  inverted candrabindu → ں
  'ं': 'ں', // ं  anusvara    → ں
  'ँ': 'ں', // ँ  candrabindu → ں
  'ः': 'ہ', // ः  visarga     → ہ
  '्': '', // ्  virama: suppresses a vowel we never added
  '़': '', // ़  a stray nukta with nothing to attach to
  'ऽ': '', // ऽ  avagraha
  '।': '۔', // ।  danda       → ۔
  '॥': '۔', // ॥  double danda→ ۔
};

/**
 * Devanagari digits to Latin.
 *
 * Deliberately Latin and not Urdu's own ۰-۹: a figure is read back against
 * what is on the screen behind it, and the screens are Latin.
 */
const DIGITS: Record<string, string> = {
  '०': '0',
  '१': '1',
  '२': '2',
  '३': '3',
  '४': '4',
  '५': '5',
  '६': '6',
  '७': '7',
  '८': '8',
  '९': '9',
};

const MAP: Record<string, string> = {
  ...CONSONANTS,
  ...NUKTA,
  ...VOWELS,
  ...MATRAS,
  ...MARKS,
  ...DIGITS,
};

/** The whole Devanagari block, including the extended one. */
const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ]/;

export const hasDevanagari = (text: string): boolean => DEVANAGARI.test(text ?? '');

/**
 * Rewrite any Devanagari in `text` as Urdu script.
 *
 * Returns the input unchanged when there is none, so this is safe to call on
 * every transcript chunk, including the English ones.
 */
export function devanagariToUrdu(text: string): string {
  if (!text || !DEVANAGARI.test(text)) return text;

  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    // A nukta may arrive as its own character after the base letter rather
    // than precomposed. Fold the pair before looking anything up, or ज़ would
    // come out as ج and the dot would be dropped in silence.
    if (text[i + 1] === '़' && NUKTA_BASE[ch]) {
      out += NUKTA[NUKTA_BASE[ch]];
      i++;
      continue;
    }

    const mapped = MAP[ch];
    out += mapped === undefined ? ch : mapped;
  }

  return out;
}
