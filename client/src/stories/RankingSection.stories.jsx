import RankingSection from '../components/RankingSection';

const MOCK_FILMS = [
  { id: 1, title: 'Stalker', director: 'Andrei Tarkovsky', year: '1979', fairBoosted: 9.10, boostedScore: 8.40, voterCount: 5 },
  { id: 2, title: 'Mulholland Drive', director: 'David Lynch', year: '2001', fairBoosted: 8.80, boostedScore: 8.00, voterCount: 4 },
  { id: 3, title: 'Apocalypse Now', director: 'Francis Coppola', year: '1979', fairBoosted: 8.55, boostedScore: 7.80, voterCount: 5 },
];

const MOCK_DIRECTORS = [
  { director: 'Andrei Tarkovsky', filmCount: 3, score: 8.9 },
  { director: 'David Lynch', filmCount: 2, score: 8.4 },
];

const MOCK_YEARS = [
  { year: '1979', filmCount: 2, score: 8.8 },
  { year: '2001', filmCount: 1, score: 8.8 },
];

export default {
  title: 'Components/RankingSection',
  component: RankingSection,
  parameters: {
    backgrounds: { default: 'dark', values: [{ name: 'dark', value: '#0d0d0f' }] },
  },
};

export const FilmsPanel = {
  args: {
    title: 'Top Films',
    items: MOCK_FILMS,
    scoreKey: 'fairBoosted',
    type: 'films',
    onDirectorClick: () => {},
    onYearClick: () => {},
  },
};

export const DirectorsPanel = {
  args: {
    title: 'Top Directors',
    items: MOCK_DIRECTORS,
    scoreKey: 'fairBoosted',
    type: 'directors',
    onDirectorClick: () => {},
    onYearClick: () => {},
  },
};
