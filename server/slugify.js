// URL slugs for custom lists — /lists/christougenna-2026 rather than /lists/7.
//
// Greek is transliterated to Latin rather than left as-is: a Greek slug shows
// fine in the address bar but percent-encodes into noise the moment anyone
// pastes the link into a chat app, which is exactly what these URLs are for.
//
// The result is never a bare number (a purely numeric slug is prefixed), so
// /api/lists/:key can resolve slugs and legacy numeric ids without ambiguity.

const GREEK_LETTERS = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th',
  ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p',
  ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
  ά: 'a', έ: 'e', ή: 'i', ί: 'i', ό: 'o', ύ: 'y', ώ: 'o',
  ϊ: 'i', ϋ: 'y', ΐ: 'i', ΰ: 'y',
};

const COMBINING_MARKS = /[̀-ͯ]/g;
const MAX_SLUG_LENGTH = 60;

// One digraph is worth special-casing: ου is a single vowel sound, so letter by
// letter "νουάρ" would come out "noyar" instead of "nouar" and "Χριστούγεννα"
// "christoygenna". The accent can sit on either half, hence the character class.
function transliterateGreek(text) {
  let out = '';
  for (const character of text.replace(/[οό][υύ]/g, 'ou')) {
    out += GREEK_LETTERS[character] ?? character;
  }
  return out;
}

function slugify(title) {
  const slug = transliterateGreek(String(title || '').toLowerCase())
    .normalize('NFD').replace(COMBINING_MARKS, '')   // café -> cafe
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');

  if (!slug) return 'list';                       // e.g. a title of only punctuation
  if (/^\d+$/.test(slug)) return `list-${slug}`;  // keep slugs and ids disjoint
  return slug;
}

module.exports = { slugify };
