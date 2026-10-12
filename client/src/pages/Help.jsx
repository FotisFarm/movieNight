import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './Help.css';

export default function Help() {
  const [activeTab, setActiveTab] = useState('start');

  // Interactive Checklist State
  const [checklist, setChecklist] = useState({
    profile: false,
    theme: false,
    firstRate: false,
    top10: false,
    watchlist: false,
    session: false,
  });

  const toggleCheck = (key) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const completedCount = Object.values(checklist).filter(Boolean).length;

  // Shrinkage simulator state
  const [calcN, setCalcN] = useState(3);
  const [calcRaw, setCalcRaw] = useState(9.0);
  const globalMean = 7.0;
  const shrunk = ((calcN / (calcN + 2)) * calcRaw) + ((2 / (calcN + 2)) * globalMean);
  const delta = shrunk - globalMean;

  // Bayesian confidence simulator state
  const [simVotes, setSimVotes] = useState(2);
  const [simPrior, setSimPrior] = useState(7.2);
  const [simActual, setSimActual] = useState(8.8);
  const groupSize = 5;
  const confidence = simVotes / groupSize;
  const blendedPred = (confidence * simActual) + ((1 - confidence) * simPrior);

  // Goal Finder quick switcher
  const handleGoalSelect = (tabName) => {
    setActiveTab(tabName);
    window.scrollTo({ top: 320, behavior: 'smooth' });
  };

  return (
    <div className="help-page">
      {/* ── Hero Header ── */}
      <header className="help-hero">
        <div className="help-hero-badge">💡 Complete MovieNights Handbook</div>
        <h1 className="help-hero-title">Welcome to MovieNights</h1>
        <p className="help-hero-sub">
          Everything you need to know about navigating the app, rating movies, planning movie nights, discovering hidden gems, and understanding the algorithms.
        </p>

        {/* ── Main Tab Navigation ── */}
        <nav className="help-nav-tabs" role="tablist">
          <button
            type="button"
            className={`help-nav-tab ${activeTab === 'start' ? 'active' : ''}`}
            onClick={() => setActiveTab('start')}
          >
            🚀 Quick Start & Basics
          </button>
          <button
            type="button"
            className={`help-nav-tab ${activeTab === 'films' ? 'active' : ''}`}
            onClick={() => setActiveTab('films')}
          >
            🎬 Catalog & Rating
          </button>
          <button
            type="button"
            className={`help-nav-tab ${activeTab === 'session' ? 'active' : ''}`}
            onClick={() => setActiveTab('session')}
          >
            🍿 Tonight's Session
          </button>
          <button
            type="button"
            className={`help-nav-tab ${activeTab === 'rankings' ? 'active' : ''}`}
            onClick={() => setActiveTab('rankings')}
          >
            🏆 Rankings, Stats & Lists
          </button>
          <button
            type="button"
            className={`help-nav-tab ${activeTab === 'algorithms' ? 'active' : ''}`}
            onClick={() => setActiveTab('algorithms')}
          >
            🧠 Algorithms & Vibes
          </button>
          <button
            type="button"
            className={`help-nav-tab ${activeTab === 'shortcuts' ? 'active' : ''}`}
            onClick={() => setActiveTab('shortcuts')}
          >
            ⚙️ Themes, HAL & Tips
          </button>
        </nav>
      </header>

      <div className="help-container">
        {/* ===================== TAB 1: QUICK START & BASICS ===================== */}
        {activeTab === 'start' && (
          <section className="help-section fade-in">
            <div className="help-card hero-card">
              <div className="help-card-header">
                <span className="help-card-icon">👋</span>
                <div>
                  <h2 className="help-card-title">What is MovieNights?</h2>
                  <p className="help-card-sub">A private cinematic sanctuary built for passionate film clubs</p>
                </div>
              </div>
              <p className="help-text">
                MovieNights is designed to turn watching films with friends into a rich, democratic experience. Rather than endless scrolling and indecision, the club tracks every member’s ratings, curates personal Top 10 lists, measures taste compatibility, and uses intelligent consensus algorithms to pick the perfect movie for tonight’s couch.
              </p>
            </div>

            {/* Quick Goal Finder */}
            <div className="help-card" style={{ borderLeft: '4px solid var(--accent)' }}>
              <h3 className="help-subheading">🎯 What would you like to do right now?</h3>
              <p className="help-text" style={{ marginBottom: 14 }}>
                Click any prompt below to jump directly to the right guide:
              </p>
              <div className="help-goal-grid">
                <button type="button" className="help-goal-btn" onClick={() => handleGoalSelect('session')}>
                  <span className="goal-icon">🍿</span>
                  <div className="goal-text">
                    <strong>Pick tonight's movie with attendees</strong>
                    <span>Go to Session Planner & Spin Wheel guide</span>
                  </div>
                </button>
                <button type="button" className="help-goal-btn" onClick={() => handleGoalSelect('films')}>
                  <span className="goal-icon">⭐</span>
                  <div className="goal-text">
                    <strong>Log, rate, or review a film I watched</strong>
                    <span>Go to Catalog & Rating guide</span>
                  </div>
                </button>
                <button type="button" className="help-goal-btn" onClick={() => handleGoalSelect('rankings')}>
                  <span className="goal-icon">📊</span>
                  <div className="goal-text">
                    <strong>Compare my taste against another member</strong>
                    <span>Go to Head-to-Head & Voter Stats guide</span>
                  </div>
                </button>
                <button type="button" className="help-goal-btn" onClick={() => handleGoalSelect('algorithms')}>
                  <span className="goal-icon">🧠</span>
                  <div className="goal-text">
                    <strong>Understand how predictions & vibes work</strong>
                    <span>Go to Algorithms & Bayesian guide</span>
                  </div>
                </button>
              </div>
            </div>

            {/* New Member Checklist */}
            <div className="help-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 className="help-subheading" style={{ margin: 0 }}>
                  📋 New Member Onboarding Checklist ({completedCount} / 6)
                </h3>
                <span className="help-pill badge-gold">
                  {completedCount === 6 ? '🎉 All Set! You are a Pro!' : 'Interactive Checklist'}
                </span>
              </div>
              <p className="help-text" style={{ marginBottom: 16 }}>
                Click each item as you complete it to track your setup:
              </p>
              <div className="help-checklist">
                <label className={`checklist-item ${checklist.profile ? 'done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checklist.profile}
                    onChange={() => toggleCheck('profile')}
                  />
                  <div>
                    <strong>1. Set up your Profile Picture & Password</strong>
                    <p>Click your avatar in the top right corner &gt; <em>Profile Picture</em> to upload a photo.</p>
                  </div>
                </label>

                <label className={`checklist-item ${checklist.theme ? 'done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checklist.theme}
                    onChange={() => toggleCheck('theme')}
                  />
                  <div>
                    <strong>2. Choose your favorite Cinematic Theme</strong>
                    <p>Open the theme selector in the header to pick a cinematic visual style (Matrix, Blade Runner, Amélie, etc.).</p>
                  </div>
                </label>

                <label className={`checklist-item ${checklist.firstRate ? 'done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checklist.firstRate}
                    onChange={() => toggleCheck('firstRate')}
                  />
                  <div>
                    <strong>3. Rate your first 5 films in the Catalog</strong>
                    <p>Head to <Link to="/films">Films</Link>, click any movie card, and assign your star rating (0–10).</p>
                  </div>
                </label>

                <label className={`checklist-item ${checklist.top10 ? 'done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checklist.top10}
                    onChange={() => toggleCheck('top10')}
                  />
                  <div>
                    <strong>4. Build your consecrated Top 10 list</strong>
                    <p>Open your favorite masterworks in the movie modal and assign them rank #1 through #10.</p>
                  </div>
                </label>

                <label className={`checklist-item ${checklist.watchlist ? 'done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checklist.watchlist}
                    onChange={() => toggleCheck('watchlist')}
                  />
                  <div>
                    <strong>5. Vote on films in the Watchlist</strong>
                    <p>Check out the <Link to="/watchlist">Watchlist</Link> to vote for movies you want to watch next.</p>
                  </div>
                </label>

                <label className={`checklist-item ${checklist.session ? 'done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checklist.session}
                    onChange={() => toggleCheck('session')}
                  />
                  <div>
                    <strong>6. Run a test Session & Spin the Wheel</strong>
                    <p>Visit <Link to="/session">Tonight's Session</Link>, select tonight's couch attendees, and spin the wheel!</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Rating Scale Philosophy */}
            <div className="help-card">
              <h3 className="help-subheading">⭐ The MovieNights Rating Scale Philosophy</h3>
              <p className="help-text" style={{ marginBottom: 16 }}>
                Ratings range from <strong>0.0 to 10.0</strong> (with decimals supported). Here is how our club calibrates scores:
              </p>
              <div className="help-rating-grid">
                <div className="rating-pill-card">
                  <span className="rating-score-badge gold">10.0</span>
                  <div>
                    <strong>Masterwork / All-Time Favorite</strong>
                    <p>A transcendent film that deeply moves you. Usually reserved for your Top 10 list.</p>
                  </div>
                </div>
                <div className="rating-pill-card">
                  <span className="rating-score-badge green">8.5 – 9.5</span>
                  <div>
                    <strong>Exceptional / Highly Recommended</strong>
                    <p>Near-flawless execution, unforgettable directing, storytelling, or emotional impact.</p>
                  </div>
                </div>
                <div className="rating-pill-card">
                  <span className="rating-score-badge blue">7.0 – 8.0</span>
                  <div>
                    <strong>Very Good / Solid Club Standard</strong>
                    <p>Thoroughly enjoyable and worth watching. The average club score is ~7.0★.</p>
                  </div>
                </div>
                <div className="rating-pill-card">
                  <span className="rating-score-badge orange">5.5 – 6.5</span>
                  <div>
                    <strong>Decent / Mediocre / Flawed</strong>
                    <p>Had interesting elements or scenes, but overall underwhelming or forgettable.</p>
                  </div>
                </div>
                <div className="rating-pill-card">
                  <span className="rating-score-badge red">&lt; 5.0</span>
                  <div>
                    <strong>Poor / Disappointment</strong>
                    <p>Major flaws in script, pacing, or tone. Did not enjoy the experience.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ===================== TAB 2: CATALOG & RATING ===================== */}
        {activeTab === 'films' && (
          <section className="help-section fade-in">
            <div className="help-card hero-card">
              <div className="help-card-header">
                <span className="help-card-icon">🎬</span>
                <div>
                  <h2 className="help-card-title">The Films Catalog & The Movie Modal</h2>
                  <p className="help-card-sub">Your master hub for browsing, filtering, rating, and curating films</p>
                </div>
              </div>
              <p className="help-text">
                The <Link to="/films"><strong>Films</strong></Link> page displays every movie our club has ever watched, shortlisted, or scheduled. You can filter by deep criteria or click any card to inspect all voter ratings and comments.
              </p>
            </div>

            <div className="help-grid-2">
              <div className="help-card">
                <h3 className="help-subheading">🔍 Powerful Search & Filtering</h3>
                <ul className="help-list">
                  <li><strong>Instant Title & Director Search:</strong> Type any title or director name in the search box.</li>
                  <li><strong>🏷️ Theme & Keyword Filter:</strong> Type subgenres or tropes (e.g. <em>neo-noir</em>, <em>dystopia</em>, <em>dark comedy</em>) with autocomplete and quick pills. Deep-linked to the URL!</li>
                  <li><strong>Status Filters:</strong> Toggle <em>MN Only</em> (official Movie Night screenings) or <em>Watchlist Only</em>.</li>
                  <li><strong>Decade & Year:</strong> Narrow down to the 1970s, 1990s, or specific years.</li>
                  <li><strong>🇬🇷 Streaming in Greece:</strong> Filter for films currently streaming on Cinobo, Netflix, Ertflix, etc.</li>
                  <li><strong>Voter Filters:</strong> View films seen by specific members (e.g., <em>"Films Fotis rated &ge; 9.0"</em>).</li>
                </ul>
              </div>

              <div className="help-card">
                <h3 className="help-subheading">🪟 The Movie Modal Deep Dive</h3>
                <p className="help-text" style={{ marginBottom: 12 }}>
                  Clicking any film card opens the interactive modal containing:
                </p>
                <ul className="help-list">
                  <li><strong>Voter Rating Pills:</strong> View each member's score and avatar. Click an avatar to enlarge their profile picture.</li>
                  <li><strong>Star Rating Slider:</strong> Drag or click to assign your personal rating (0–10).</li>
                  <li><strong>Personal Review Comments:</strong> Leave notes or jokes explaining why you loved or hated it.</li>
                  <li><strong>Top 10 Assignment:</strong> Assign or change this film's rank (#1 to #10) in your Top 10 list.</li>
                  <li><strong>Watchlist & MN Toggles:</strong> Flag it for an upcoming night or mark it as an official club screening.</li>
                  <li><strong>🏷️ Keywords Toggle:</strong> Click <em>"Show keywords & themes"</em> to reveal TMDB plot tags.</li>
                  <li><strong>Letterboxd & IMDb Links:</strong> One click jumps to official pages, synopsis, and trailers.</li>
                </ul>
              </div>
            </div>

            <div className="help-callout" style={{ marginTop: 10 }}>
              <strong>💡 Pro Tip: Quick Sorting</strong><br />
              Use the sort dropdown in the Films page to rank the catalog by <strong>Club Fair Score</strong>, <strong>Letterboxd Rating</strong>, <strong>Release Year</strong>, <strong>Runtime</strong>, or any individual voter's scores to see their personal favorites!
            </div>
          </section>
        )}

        {/* ===================== TAB 3: TONIGHT'S SESSION ===================== */}
        {activeTab === 'session' && (
          <section className="help-section fade-in">
            <div className="help-card hero-card">
              <div className="help-card-header">
                <span className="help-card-icon">🍿</span>
                <div>
                  <h2 className="help-card-title">Running a Movie Night: Tonight's Session</h2>
                  <p className="help-card-sub">The consensus planner and animated Spin Wheel for couch nights</p>
                </div>
              </div>
              <p className="help-text">
                When the club gathers on movie night, go straight to <Link to="/session"><strong>Tonight's Session</strong></Link>. Instead of endless debating, the system tailors candidate movies to the exact attendees in the room.
              </p>
            </div>

            {/* 5-Step Workflow */}
            <div className="help-card">
              <h3 className="help-subheading">Step-by-Step Movie Night Workflow</h3>
              <div className="help-steps-grid">
                <div className="step-box">
                  <div className="step-badge">Step 1</div>
                  <strong>Couch Check-in</strong>
                  <p>Check the boxes for members who are present tonight. Predictions update in real time for those viewers only.</p>
                </div>

                <div className="step-box">
                  <div className="step-badge">Step 2</div>
                  <strong>Select Tonight's Vibe</strong>
                  <p>Pick the mood: <strong>Crowd Pleaser</strong> (safe), <strong>Club DNA</strong> (our taste), <strong>Fresh Gems</strong> (unrated), or <strong>Wildcard</strong> (debate).</p>
                </div>

                <div className="step-box">
                  <div className="step-badge">Step 3</div>
                  <strong>Apply Constraints</strong>
                  <p>Set a max runtime (e.g. &le; 120 mins), decade, or filter to movies streaming right now in Greece.</p>
                </div>

                <div className="step-box">
                  <div className="step-badge">Step 4</div>
                  <strong>Review Leaderboard</strong>
                  <p>Review the top consensus candidates, attendee score breakdown, and room badges.</p>
                </div>

                <div className="step-box">
                  <div className="step-badge">Step 5</div>
                  <strong>Spin the Wheel! 🎡</strong>
                  <p>Launch the interactive Spin Wheel to randomly pick the winner, weighted by consensus score!</p>
                </div>
              </div>
            </div>

            <div className="help-grid-2">
              <div className="help-card">
                <h3 className="help-subheading">🎯 Understanding Session Match %</h3>
                <p className="help-text">
                  Each candidate card shows a <strong>Match Percentage</strong> (50% to 100%) and score breakdown:
                </p>
                <ul className="help-list">
                  <li><strong>Expected Attendee Average:</strong> The projected average rating among tonight's couch.</li>
                  <li><strong>Worst-Case Floor (minPred):</strong> Protects against any single viewer having a miserable time.</li>
                  <li><strong>Spread (max - min):</strong> Highlights taste agreement vs polarization.</li>
                  <li><strong>Watchlist Synergy:</strong> Unanimous interest adds a +0.35★ bonus.</li>
                  <li><strong>Re-watch Novelty Discount:</strong> Deducts 0.6★ if 100% of attendees have already seen it, giving fresh movies a fair chance.</li>
                </ul>
              </div>

              <div className="help-card">
                <h3 className="help-subheading">🎡 The Animated Spin Wheel</h3>
                <p className="help-text">
                  The wheel eliminates decision paralysis:
                </p>
                <ul className="help-list">
                  <li><strong>Consensus-Weighted Slices:</strong> Higher scoring films get wider slices on the wheel, rewarding better fits while keeping the excitement of chance.</li>
                  <li><strong>Equal Slices Mode:</strong> Toggle to give every candidate an equal 50/50 shot.</li>
                  <li><strong>Remove Slices:</strong> If the room vetoes a movie, remove it from the wheel with one click and re-spin.</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* ===================== TAB 4: RANKINGS, STATS & LISTS ===================== */}
        {activeTab === 'rankings' && (
          <section className="help-section fade-in">
            <div className="help-card hero-card">
              <div className="help-card-header">
                <span className="help-card-icon">🏆</span>
                <div>
                  <h2 className="help-card-title">Rankings, Stats & Custom Lists</h2>
                  <p className="help-card-sub">The Hall of Fame, voter analytics, and thematic collections</p>
                </div>
              </div>
              <p className="help-text">
                MovieNights tracks deep statistics on club history, member compatibility, and curated collections.
              </p>
            </div>

            <div className="help-grid-2">
              <div className="help-card">
                <h3 className="help-subheading">🏆 Hall of Fame (<Link to="/rankings">Rankings</Link>)</h3>
                <ul className="help-list">
                  <li><strong>All-Time Movie Leaderboard:</strong> Ranked by Fair Boosted Score (including Top 10 bonuses).</li>
                  <li><strong>Director Leaderboard:</strong> The club’s highest-rated directors (minimum 2 rated films).</li>
                  <li><strong>Decade Leaderboard:</strong> See which film eras our club loves most (e.g. 1970s vs 1990s).</li>
                  <li><strong>🏷️ Clickable Keyword Leaderboard:</strong> Highlights our most frequent and top-scoring themes. Click any theme to immediately filter the catalog!</li>
                  <li><strong>Member Top 10 Lists:</strong> Browse each voter's personal consecrated masterpieces.</li>
                </ul>
              </div>

              <div className="help-card">
                <h3 className="help-subheading">📊 Voter Analytics (<Link to="/stats">Stats</Link>)</h3>
                <p className="help-text" style={{ marginBottom: 12 }}>
                  Discover each member's cinematic DNA:
                </p>
                <ul className="help-list">
                  <li><strong>Harshness / Bias:</strong> Measures how strict or generous a voter is compared to the club average.</li>
                  <li><strong>Polarization Index:</strong> Reveals who agrees most with the group consensus vs. who is an eccentric contrarian.</li>
                  <li><strong>Personal Keyword Affinities:</strong> See each member's favorite subgenres and click to view their rated films.</li>
                  <li><strong>Voter Breakdown Modal:</strong> Click any voter to open their full interactive profile card.</li>
                </ul>
              </div>
            </div>

            <div className="help-grid-2" style={{ marginTop: 20 }}>
              <div className="help-card">
                <h3 className="help-subheading">⚖️ Head-to-Head Compare (<Link to="/compare">Compare</Link>)</h3>
                <ul className="help-list">
                  <li><strong>Voter Matchups:</strong> Select two members to view their mutual agreement rate, correlation coefficient, and biggest taste clashes.</li>
                  <li><strong>Movie Matchups:</strong> Compare two movies side-by-side to inspect how members split their ratings.</li>
                  <li><strong>Controversy Hub (<Link to="/controversy">Controversy</Link>):</strong> Identifies the most polarizing films in club history (highest standard deviation).</li>
                </ul>
              </div>

              <div className="help-card">
                <h3 className="help-subheading">📜 Curated Lists & Marathons (<Link to="/lists">Lists</Link>)</h3>
                <ul className="help-list">
                  <li><strong>Thematic Collections:</strong> Create lists like <em>"Halloween Horror Marathon"</em>, <em>"Cannes Palme d'Or Winners"</em>, or <em>"Studio Ghibli Retrospective"</em>.</li>
                  <li><strong>Custom URL Slugs:</strong> Share lists easily with custom URLs (e.g. <code>/lists/christougenna-2026</code>).</li>
                  <li><strong>Progress Tracking:</strong> See at a glance which films in the list the club has already watched.</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* ===================== TAB 5: ALGORITHMS & VIBES ===================== */}
        {activeTab === 'algorithms' && (
          <section className="help-section fade-in">
            <div className="help-card hero-card">
              <div className="help-card-header">
                <span className="help-card-icon">🧠</span>
                <div>
                  <h2 className="help-card-title">The Brain: Algorithms, Themes & Vibes</h2>
                  <p className="help-card-sub">The transparent mathematical engine powering Bayesian predictions</p>
                </div>
              </div>
              <p className="help-text">
                MovieNights blends three mathematical pillars: <strong>Empirical Bayes Shrinkage</strong>, <strong>Dynamic Vibe Presets</strong>, and <strong>Leave-One-Out validation</strong>.
              </p>
            </div>

            {/* Vibes Section */}
            <div className="help-card">
              <h3 className="help-subheading">🎭 The 4 Vibe Presets Explained</h3>
              <p className="help-text" style={{ marginBottom: 16 }}>
                Vibes are predictive scoring lenses. They change the weights given to global critical acclaim vs internal club history:
              </p>
              <div className="help-grid-2">
                <div className="help-card vibe-card-safe" style={{ margin: 0 }}>
                  <div className="help-card-header">
                    <span className="help-card-icon">🛡️</span>
                    <div>
                      <h4 className="help-card-title" style={{ color: '#34d399' }}>Crowd Pleaser</h4>
                      <p className="help-card-sub">Outside-In · Zero Controversy</p>
                    </div>
                  </div>
                  <div className="help-formula-box">
                    Letterboxd Acclaim: 55%<br />
                    Expected Club Avg:  25%<br />
                    Director Track:     20%<br />
                    Thematic Match:      4%
                  </div>
                  <p className="help-text">
                    <strong>Best for:</strong> Mixed groups, guests, or low-friction nights where you want guaranteed universal satisfaction.
                  </p>
                </div>

                <div className="help-card vibe-card-dna" style={{ margin: 0 }}>
                  <div className="help-card-header">
                    <span className="help-card-icon">🎬</span>
                    <div>
                      <h4 className="help-card-title" style={{ color: '#60a5fa' }}>Club DNA</h4>
                      <p className="help-card-sub">Inside-Out · Our Signature Taste</p>
                    </div>
                  </div>
                  <div className="help-formula-box">
                    Director Track:     60%<br />
                    Thematic Fit:       20%<br />
                    Letterboxd Acclaim: 15%<br />
                    Top 10 Halo Boost:  2.0x Multiplier!
                  </div>
                  <p className="help-text">
                    <strong>Best for:</strong> Core club nights celebrating our group's favorite auteur filmmakers and themes.
                  </p>
                </div>

                <div className="help-card vibe-card-gems" style={{ margin: 0 }}>
                  <div className="help-card-header">
                    <span className="help-card-icon">💎</span>
                    <div>
                      <h4 className="help-card-title" style={{ color: '#a78bfa' }}>Fresh Gems</h4>
                      <p className="help-card-sub">Unrated Acclaim · Fresh Discoveries</p>
                    </div>
                  </div>
                  <div className="help-formula-box">
                    Letterboxd Acclaim: 65%<br />
                    Decade Era Score:   20%<br />
                    Director History:   15%<br />
                    Filter: maxVoters = 0 (strictly unrated)
                  </div>
                  <p className="help-text">
                    <strong>Best for:</strong> Uncovering overlooked critical masterpieces that nobody in attendance has rated yet.
                  </p>
                </div>

                <div className="help-card vibe-card-wildcard" style={{ margin: 0 }}>
                  <div className="help-card-header">
                    <span className="help-card-icon">⚡</span>
                    <div>
                      <h4 className="help-card-title" style={{ color: '#f87171' }}>Wildcard</h4>
                      <p className="help-card-sub">Sparks & Debates · Era-Spanning</p>
                    </div>
                  </div>
                  <div className="help-formula-box">
                    Decade Exploration: 45%<br />
                    Director Track:     35%<br />
                    Letterboxd Acclaim: 20%<br />
                    Session Match: + (Spread * 0.22)
                  </div>
                  <p className="help-text">
                    <strong>Best for:</strong> Polarizing cinema that sparks fiery, passionate post-movie discussion.
                  </p>
                </div>
              </div>
            </div>

            {/* Interactive Shrinkage Simulator */}
            <div className="help-tool-box">
              <h3 className="help-subheading" style={{ color: 'var(--accent)' }}>
                🧪 Simulator 1: Empirical Bayes Shrinkage (Thematic Wheelhouse)
              </h3>
              <p className="help-text" style={{ marginBottom: 16 }}>
                Adjust sample size <code>n</code> and raw score to see how Bayesian shrinkage dampens small-sample fluke ratings toward the club mean (7.0★):
              </p>
              <div className="help-slider-row">
                <label>Number of Rated Films with Keyword (n):</label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={calcN}
                  onChange={e => setCalcN(parseInt(e.target.value, 10))}
                />
                <span className="help-slider-val">{calcN} {calcN === 1 ? 'film' : 'films'}</span>
              </div>
              <div className="help-slider-row">
                <label>Raw Club Average Rating:</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.1"
                  value={calcRaw}
                  onChange={e => setCalcRaw(parseFloat(e.target.value))}
                />
                <span className="help-slider-val">{calcRaw.toFixed(1)} ★</span>
              </div>
              <div className="help-sim-result">
                <div>
                  <div className="help-result-label">Shrunk Score (C=2)</div>
                  <div className="help-result-num">{shrunk.toFixed(1)} ★</div>
                </div>
                <div>
                  <div className="help-result-label">Club Delta (Δ)</div>
                  <div className={`help-result-delta ${delta >= 0 ? 'pos' : 'neg'}`}>
                    {delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)} ★
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Confidence Simulator */}
            <div className="help-tool-box">
              <h3 className="help-subheading" style={{ color: 'var(--accent)' }}>
                🧪 Simulator 2: Bayesian Confidence Blend (Prior vs. Reality)
              </h3>
              <p className="help-text" style={{ marginBottom: 16 }}>
                See how a film's prediction transitions smoothly from the Prior expectation to the actual Fair Score as more members log their votes:
              </p>
              <div className="help-slider-row">
                <label>Voter Ratings Count (voters / 5):</label>
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={simVotes}
                  onChange={e => setSimVotes(parseInt(e.target.value, 10))}
                />
                <span className="help-slider-val">{simVotes} / 5 ({Math.round(confidence * 100)}%)</span>
              </div>
              <div className="help-slider-row">
                <label>Bayesian Prior Expectation:</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.1"
                  value={simPrior}
                  onChange={e => setSimPrior(parseFloat(e.target.value))}
                />
                <span className="help-slider-val">{simPrior.toFixed(1)} ★</span>
              </div>
              <div className="help-slider-row">
                <label>Actual Rated Average Score:</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.1"
                  value={simActual}
                  onChange={e => setSimActual(parseFloat(e.target.value))}
                />
                <span className="help-slider-val">{simActual.toFixed(1)} ★</span>
              </div>
              <div className="help-sim-result">
                <div>
                  <div className="help-result-label">Blended Predicted Score</div>
                  <div className="help-result-num">{blendedPred.toFixed(2)} ★</div>
                </div>
                <div>
                  <div className="help-result-label">Weight Distribution</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
                    {Math.round((1 - confidence) * 100)}% Prior · {Math.round(confidence * 100)}% Actual
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ===================== TAB 6: THEMES, HAL & TIPS ===================== */}
        {activeTab === 'shortcuts' && (
          <section className="help-section fade-in">
            <div className="help-card hero-card">
              <div className="help-card-header">
                <span className="help-card-icon">⚙️</span>
                <div>
                  <h2 className="help-card-title">Customization, HAL 9000 & Pro Tips</h2>
                  <p className="help-card-sub">Power-user features to elevate your MovieNights experience</p>
                </div>
              </div>
              <p className="help-text">
                MovieNights includes rich visual themes, an integrated AI assistant, and keyboard shortcuts designed for speed and joy.
              </p>
            </div>

            <div className="help-grid-2">
              <div className="help-card">
                <h3 className="help-subheading">🎨 10 Cinematic Visual Themes</h3>
                <p className="help-text" style={{ marginBottom: 12 }}>
                  Switch themes anytime from the header dropdown menu. Each palette is handcrafted to evoke cinema history:
                </p>
                <div className="help-theme-tags">
                  <span className="theme-tag">🟢 The Matrix</span>
                  <span className="theme-tag">🔵 Blade Runner</span>
                  <span className="theme-tag">🔴 Vertigo</span>
                  <span className="theme-tag">🟠 A Clockwork Orange</span>
                  <span className="theme-tag">🟡 Taxi Driver</span>
                  <span className="theme-tag">🟢 Amélie</span>
                  <span className="theme-tag">🔴 The Godfather</span>
                  <span className="theme-tag">🟣 The Grand Budapest Hotel</span>
                  <span className="theme-tag">🔴 In the Mood for Love</span>
                  <span className="theme-tag">⚪ Original Dark</span>
                </div>
              </div>

              <div className="help-card">
                <h3 className="help-subheading">👁️ Ask HAL 9000 (AI Film Assistant)</h3>
                <p className="help-text" style={{ marginBottom: 12 }}>
                  MovieNights has a built-in AI concierge powered by Claude. HAL knows our club's entire catalog, history, and taste:
                </p>
                <ul className="help-list">
                  <li><strong>Shortcut:</strong> Press <kbd className="help-kbd">Ctrl</kbd> + <kbd className="help-kbd">K</kbd> anywhere in the app (or click HAL's red eye in the header).</li>
                  <li><strong>Ask Anything:</strong> <em>"What should we watch tonight if Fotis and Pantelis are on the couch?"</em>, <em>"Who is our harshest critic on sci-fi?"</em>, or <em>"Suggest an unrated Korean thriller."</em></li>
                </ul>
              </div>
            </div>

            <div className="help-grid-2" style={{ marginTop: 20 }}>
              <div className="help-card">
                <h3 className="help-subheading">⌨️ Keyboard Shortcuts</h3>
                <table className="help-table">
                  <tbody>
                    <tr>
                      <td><kbd className="help-kbd">Ctrl</kbd> + <kbd className="help-kbd">K</kbd></td>
                      <td>Open or close HAL 9000 AI drawer</td>
                    </tr>
                    <tr>
                      <td><kbd className="help-kbd">Esc</kbd></td>
                      <td>Close Movie Modal, Zoom Lightbox, or Drawer</td>
                    </tr>
                    <tr>
                      <td><kbd className="help-kbd">Space</kbd></td>
                      <td>Trigger the Spin Wheel in Tonight's Session</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="help-card">
                <h3 className="help-subheading">📷 Profile Avatars & Lightbox Zoom</h3>
                <ul className="help-list">
                  <li><strong>Custom Pictures:</strong> Upload any image from your device via the User Menu &gt; <em>Change Profile Picture</em>.</li>
                  <li><strong>Click-to-Zoom:</strong> Click any voter avatar in the Movie Modal or Leaderboards to pop open an enlarged lightbox preview.</li>
                </ul>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
