import { useMemo } from 'react';
import { useAppConfig } from '../AppConfigContext';

export function useRankMap(allMovies) {
  const { minVoters } = useAppConfig();
  return useMemo(() => {
    const rated   = allMovies.filter(m => m.voterCount >= minVoters);
    const ratedMn = rated.filter(m => m.mn);

    function tiebreak(a, b) {
      if (b.voterCount !== a.voterCount) return b.voterCount - a.voterCount;
      if ((b.boost ?? 0) !== (a.boost ?? 0)) return (b.boost ?? 0) - (a.boost ?? 0);
      return (parseInt(a.year) || 9999) - (parseInt(b.year) || 9999);
    }
    const byFair  = (a, b) => (b.fairBoosted  - a.fairBoosted)  || tiebreak(a, b);
    const byGroup = (a, b) => (b.boostedScore - a.boostedScore) || tiebreak(a, b);
    const toMap   = arr => {
      const m = {};
      arr.forEach((x, i) => { m[x.id] = i + 1; });
      return m;
    };
    return {
      fair:    toMap([...rated].sort(byFair)),
      group:   toMap([...rated].sort(byGroup)),
      mnFair:  toMap([...ratedMn].sort(byFair)),
      mnGroup: toMap([...ratedMn].sort(byGroup)),
    };
  }, [allMovies, minVoters]);
}
