// Letterboxd scraper & rating resolver.
// Fetches canonical Letterboxd page via /imdb/{imdb_id}/ and parses the
// schema.org aggregateRating.ratingValue (5-star scale with 2 decimals, e.g. 4.63).
const https = require('https');

function fetchLetterboxdRating(imdbId) {
  if (!imdbId) return Promise.resolve(null);
  const cleanId = String(imdbId).trim();
  if (!cleanId) return Promise.resolve(null);

  return new Promise((resolve) => {
    function doReq(urlStr, redirects = 0) {
      if (redirects > 3) return resolve(null);
      let url;
      try {
        url = new URL(urlStr, 'https://letterboxd.com');
      } catch {
        return resolve(null);
      }

      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      };

      const req = https.get(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doReq(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) return resolve(null);

        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          const m = data.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
          if (m) {
            try {
              const clean = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
              const json = JSON.parse(clean);
              const val = json.aggregateRating?.ratingValue;
              if (typeof val === 'number' && !isNaN(val)) {
                return resolve(Math.round(val * 100) / 100);
              }
            } catch (_) {}
          }
          resolve(null);
        });
      });

      req.on('error', () => resolve(null));
      req.setTimeout(8000, () => {
        req.destroy();
        resolve(null);
      });
    }

    doReq(`https://letterboxd.com/imdb/${encodeURIComponent(cleanId)}/`);
  });
}

module.exports = { fetchLetterboxdRating };
