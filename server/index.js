const express = require('express');
const cors = require('cors');
const path = require('path');
const { seed } = require('./seed');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

app.use(express.json());
app.use(cors({ origin: IS_PROD ? false : 'http://localhost:5173' }));

seed();

app.use('/api/movies', require('./routes/movies'));
app.use('/api/rankings', require('./routes/rankings'));

if (IS_PROD) {
  const clientDist = path.join(__dirname, 'public');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) =>
    res.sendFile(path.join(clientDist, 'index.html'))
  );
}

app.listen(PORT, () =>
  console.log(`Movie Nights running on http://localhost:${PORT}`)
);
