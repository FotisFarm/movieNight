// Hardcodes IMDb IDs for films OMDb can't find by title, then fetches their ratings.
const db = require('../db');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEY = process.env.OMDB_API_KEY;

const known = [
  ['Casablanca',                          'tt0034583'],
  ['Spirited Away',                       'tt0245429'],
  ['Kill Bill: Volume 1',                 'tt0266697'],
  ['A Fistful of Dollars',               'tt0058461'],
  ['For a Few Dollars More',             'tt0059578'],
  ['The Good, the Bad and the Ugly',     'tt0060196'],
  ['A Fistful of Dynamite',              'tt0067006'],
  ['Harakiri',                            'tt0056058'],
  ['Rushmore',                            'tt0128445'],
  ['Cries and Whispers',                  'tt0069467'],
  ['Million Dollar Baby',                 'tt0405159'],
  ['The Pianist',                         'tt0253474'],
  ['Inherent Vice',                       'tt1791528'],
  ['Phantom Thread',                      'tt5776858'],
  ['Breathless',                          'tt0053472'],
  ['Shadows',                             'tt0053170'],
  ['Bed and Board',                       'tt0065555'],
  ['Such a Gorgeous Kid Like Me',         'tt0066985'],
  ["Don't Come Knocking",                 'tt0365686'],
  ['The Wrong Move',                      'tt0073636'],
  ['The Scarlet Letter',                  'tt0069584'],
  ['Fellini Satyricon',                   'tt0064554'],
  ["Fellini's Casanova",                  'tt0074748'],
  ['Ginger e Fred',                       'tt0089177'],
  ['I Clowns',                            'tt0066806'],
  ['Il bidone',                           'tt0048006'],
  ['La voce della luna',                  'tt0100203'],
  ['Le notte di Cabiria',                 'tt0050783'],
  ['Lo Sceicco Bianco',                   'tt0045446'],
  ['Prova d\' orchestra',                 'tt0078163'],
  ['And the Ship Sails On',               'tt0085409'],
  ['La vita e bella',                     'tt0118799'],
  ['La Chinoise',                         'tt0061784'],
  ['My Life to Live',                     'tt0056456'],
  ['Two or Three Things I Know About Her','tt0061795'],
  ['Il Gattopardo',                       'tt0057091'],
  ['Morte a Venezia',                     'tt0067015'],
  ['Rocco E I Suoi Fratelli',             'tt0054160'],
  ['The Steamroller and the Violin',      'tt0054155'],
  ['Il mostro',                           'tt0110754'],
  ['La tigre e la neve',                  'tt0462200'],
  ['Caro Diario',                         'tt0106549'],
  ['La stanza del figlio',                'tt0278019'],
  ['Palombella rossa',                    'tt0097921'],
  ['Cléo de 5 à 7',                       'tt0054852'],
  ['Goya\'s Ghost',                       'tt0401711'],
];

const setId   = db.prepare('UPDATE movies SET imdb_id = ? WHERE title = ? AND imdb_id IS NULL');
const setRating = db.prepare('UPDATE movies SET imdb_rating = ? WHERE id = ?');
const getById = db.prepare('SELECT id, title FROM movies WHERE title = ?');

(async () => {
  for (const [title, imdbId] of known) {
    const m = getById.get(title);
    if (!m) { console.log(`skip (not in db): ${title}`); continue; }

    setId.run(imdbId, title);

    if (KEY) {
      const data = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${KEY}`).then(r => r.json());
      const rating = data.imdbRating && data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null;
      setRating.run(rating, m.id);
      console.log(`✓ ${title} → ${imdbId} [${rating ?? 'no rating'}]`);
      await sleep(150);
    } else {
      console.log(`✓ ${title} → ${imdbId} [id only, no API key]`);
    }
  }
  console.log('\nDone.');
})();
