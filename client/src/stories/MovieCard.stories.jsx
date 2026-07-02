import MovieCard from '../components/MovieCard';

const MOCK_BASE = {
  id: 1,
  title: 'Stalker',
  director: 'Andrei Tarkovsky',
  year: '1979',
  mn: false,
  watchlist: false,
  rank_global: null,
  mn_rank: null,
  voterCount: 0,
  ratings: {},
  top3: {},
  fairBoosted: null,
  boostedScore: null,
  boost: 0,
};

const MOCK_RATED = {
  ...MOCK_BASE,
  voterCount: 5,
  ratings: { 'Μητσέας': 9, 'Παντελής': 8.5, 'Στέλιας': 7, 'Φώτης': 9.5, 'Λεόντιος': 8 },
  top3: { 'Φώτης': 1, 'Μητσέας': 3 },
  fairBoosted: 9.1,
  boostedScore: 8.4,
  boost: 1.9,
};

export default {
  title: 'Components/MovieCard',
  component: MovieCard,
  args: { onClick: () => {} },
  parameters: {
    backgrounds: { default: 'dark', values: [{ name: 'dark', value: '#0d0d0f' }] },
  },
};

export const ListViewUnrated = {
  args: { movie: MOCK_BASE, listView: true, scoreMode: 'fair' },
};

export const ListViewRated = {
  args: { movie: MOCK_RATED, listView: true, scoreMode: 'fair' },
};

export const ListViewGroup = {
  args: { movie: MOCK_RATED, listView: true, scoreMode: 'group' },
};

export const GridViewRated = {
  args: { movie: MOCK_RATED, listView: false, scoreMode: 'fair' },
};

export const WithMNBadge = {
  args: {
    movie: { ...MOCK_RATED, mn: true, mn_rank: 4, rank_global: 12 },
    listView: true,
    scoreMode: 'fair',
  },
};

export const WithWatchlist = {
  args: {
    movie: { ...MOCK_BASE, watchlist: true },
    listView: true,
    scoreMode: 'fair',
  },
};

export const LowScore = {
  args: {
    movie: {
      ...MOCK_RATED,
      ratings: { 'Μητσέας': 3, 'Παντελής': 2, 'Στέλιας': 4, 'Φώτης': 2.5, 'Λεόντιος': 3 },
      fairBoosted: 2.9,
      boostedScore: 2.9,
      top3: {},
      boost: 0,
    },
    listView: true,
    scoreMode: 'fair',
  },
};
