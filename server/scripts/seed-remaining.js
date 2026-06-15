const db = require('../db');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEY = process.env.OMDB_API_KEY;
if (!KEY) { console.error('Set OMDB_API_KEY'); process.exit(1); }

// [db_id, imdb_id, local_title]
const known = [
  // English-titled fixable
  [381, 'tt0092337', 'Dekalog'],
  [745, 'tt15239678', 'Dune Part 2'],
  [688, 'tt3628826',  'The BFG'],
  [7,   'tt0071615',  'The Holy Mountain'],
  [376, 'tt0092829',  "Where is the Friend's Home?"],
  [295, 'tt0018645',  'Easy Virtue'],
  [301, 'tt0021000',  'Juno and the Paycock'],
  [308, 'tt0023150',  'Number Seventeen'],
  [312, 'tt0022373',  'Rich and Strange'],
  [339, 'tt0025765',  'Waltzes from Vienna'],
  [679, 'tt0107290',  'Jurassic Prak → Jurassic Park'],
  [757, 'tt7376824',  'Kursk'],
  // Italian (Moretti etc.)
  [553, 'tt0841308',  'Il caimano'],
  [555, 'tt0074815',  'Io sono un autarchico'],
  [556, 'tt0089581',  'La messa e finita'],
  [560, 'tt10640902', 'Tre piani'],
  [554, 'tt20412752', "il sol dell'avvenire"],
  // Woody Allen (stored as "All about sex")
  [8,   'tt0068558',  'All about sex → Everything You Always Wanted to Know...'],
  // Antonioni / Wenders
  [31,  'tt0112702',  'Beyond the Cloud'],
  [33,  'tt0068239',  'Chung Kuo, Chia'],
  [41,  'tt0048291',  'The Girl Friends (Le amiche)'],
  [802, 'tt4618776',  'The Beautiful Days of Aranjunez'],
  // Bergman
  [53,  'tt0039650',  'A Ship Bound for India'],
  // Godard political films
  [257, 'tt0074841',  "How's It Going (Comment ça va?)"],
  [259, 'tt0064527',  'Joy of Learning (Le gai savoir)'],
  [268, 'tt0106977',  "Oh Wow Is Me (Hélas pour moi)"],
  [271, 'tt0247845',  'Struggle in Italy (Lotte in Italia)'],
  [277, 'tt0067851',  'Vladimir et Rosa'],
  // Kiarostami
  [365, 'tt0104880',  'Life, and Nothing More...'],
  // Kurosawa
  [421, 'tt0038099',  'Sanshiro Sugata Part II'],
  // Wenders early
  [801, 'tt0066366',  'Summer in the City'],
  // Kieslowski
  [383, 'tt0083236',  'Short Working Day (Krótki dzień pracy)'],
  // Greek films — non-Angelopoulos
  [830, 'tt0049577',  'Ο Δράκος (The Ogre of Athens)'],
  [828, 'tt0053819',  'Συνοικία το Όνειρο (Dream Suburb)'],
  [829, 'tt0057397',  'Τα Κόκκινα Φανάρια (The Red Lanterns)'],
  // Angelopoulos
  [814, 'tt0066234',  'Αναπαράσταση (Reconstruction)'],
  [818, 'tt0068908',  "Μέρες του '36 (Days of '36)"],
  [820, 'tt0072401',  'Ο Θίασος (The Travelling Players)'],
  [822, 'tt0075968',  'Οι κυνηγοί (The Hunters)'],
  [817, 'tt0080688',  'Μεγαλέξαντρος (Alexander the Great)'],
  [821, 'tt0091584',  'Ο Μελισσοκόμος (The Beekeeper)'],
  [823, 'tt0088235',  'Ταξίδι στα Κύθηρα (Voyage to Cythera)'],
  [827, 'tt0095516',  'Τοπίο στην Ομίχλη (Landscape in the Mist)'],
  [826, 'tt0102842',  'Το Μετέωρο Βήμα του Πελαργού (Suspended Step of the Stork)'],
  [824, 'tt0114722',  "Το βλέμμα του Οδυσσέα (Ulysses' Gaze)"],
  [819, 'tt0124134',  'Μια Αιωνιότητα και μία Μέρα (Eternity and a Day)'],
  [825, 'tt0319813',  'Το λιβάδι που δακρύζει (The Weeping Meadow)'],
  [816, 'tt1023751',  'Η Σκόνη του Χρόνου (The Dust of Time)'],
];

const setImdb = db.prepare('UPDATE movies SET imdb_id = ?, imdb_rating = ? WHERE id = ?');

(async () => {
  for (const [dbId, imdbId, label] of known) {
    const data = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${KEY}`).then(r => r.json());
    if (data.Response !== 'True') {
      console.log(`✗ [${dbId}] ${label} → ${imdbId}: ${data.Error}`);
      continue;
    }
    const rating = data.imdbRating && data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null;
    setImdb.run(imdbId, rating, dbId);
    console.log(`✓ [${dbId}] ${label} → ${data.Title} (${data.Year}) [${rating ?? 'no rating'}]`);
    await sleep(150);
  }
  console.log('\nDone. Skipped (uncertain IDs — enter manually via modal):');
  console.log('  [356] A Wedding Suit (1976)');
  console.log('  [385] The Card Index (1979)');
  console.log('  [769] Images of Liberation (1982)');
  console.log('  [815] Η Εκπομπή (1968)');
  console.log('  [813] Αθήνα, επιστροφή στην Ακρόπολη (1983)');
})();
