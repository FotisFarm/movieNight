import React, { useState } from 'react';
import './Help.css';

export default function Help() {
  const [activeTab, setActiveTab] = useState('themes');

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

  return (
    <div className="help-page">
      <header className="help-hero">
        <div className="help-hero-badge">💡 Interactive Knowledge Base</div>
        <h1 className="help-hero-title">How MovieNights Works</h1>
        <p className="help-hero-sub">
          A transparent, mathematical guide to our Bayesian prediction engine, thematic keyword wheelhouse, and consensus vibe algorithms.
        </p>

        <nav className="help-nav-tabs" role="tablist">
          <button
            type="button"
            className={`help-nav-tab ${activeTab === 'themes' ? 'active' : ''}`}
            onClick={() => setActiveTab('themes')}
          >
            🏷️ Themes & Keywords
          </button>
          <button
            type="button"
            className={`help-nav-tab ${activeTab === 'vibes' ? 'active' : ''}`}
            onClick={() => setActiveTab('vibes')}
          >
            🎭 The 4 Vibes
          </button>
          <button
            type="button"
            className={`help-nav-tab ${activeTab === 'bayesian' ? 'active' : ''}`}
            onClick={() => setActiveTab('bayesian')}
          >
            🔮 Bayesian Engine
          </button>
          <button
            type="button"
            className={`help-nav-tab ${activeTab === 'session' ? 'active' : ''}`}
            onClick={() => setActiveTab('session')}
          >
            🍿 Tonight's Consensus
          </button>
          <button
            type="button"
            className={`help-nav-tab ${activeTab === 'accuracy' ? 'active' : ''}`}
            onClick={() => setActiveTab('accuracy')}
          >
            🎯 Accuracy & Retrospective
          </button>
          <button
            type="button"
            className={`help-nav-tab ${activeTab === 'scoring' ? 'active' : ''}`}
            onClick={() => setActiveTab('scoring')}
          >
            🏆 Fair Scores & Top 10s
          </button>
        </nav>
      </header>

      <div className="help-container">
        {/* ===================== TAB: THEMES & KEYWORDS ===================== */}
        {activeTab === 'themes' && (
          <section className="help-section fade-in">
            <div className="help-card hero-card">
              <div className="help-card-header">
                <span className="help-card-icon">🏷️</span>
                <div>
                  <h2 className="help-card-title">How Themes Work: Scoring, Recommending & Predicting</h2>
                  <p className="help-card-sub">TMDB plot keywords & subgenres powering personalized Bayesian affinities</p>
                </div>
              </div>
              <p>
                Every film in our database possesses official plot keywords and subgenres from TMDB. Rather than treating keywords as static labels, MovieNights analyzes our club's entire voting history to calculate our <strong>Thematic Wheelhouse</strong>.
              </p>
            </div>

            <div className="help-grid-2">
              <div className="help-card">
                <h3 className="help-subheading">1. Ingestion & Empirical Bayes Shrinkage (C=2)</h3>
                <p className="help-text">
                  To prevent small-sample distortion (for instance, a single 10★ film artificially making an obscure tag look legendary), each keyword rating is shrunk toward our club's global average (~7.0★):
                </p>
                <div className="help-formula-box">
                  <span className="code-comment">// Empirical Bayes shrinkage formula:</span><br />
                  shrunkScore = (n / (n + 2)) * rawAvg + (2 / (n + 2)) * globalMean<br />
                  delta = shrunkScore - globalMean
                </div>
                <p className="help-text">
                  A keyword must appear in at least <strong>2 rated films</strong> to qualify for our club wheelhouse profile.
                </p>
              </div>

              <div className="help-card">
                <h3 className="help-subheading">2. The Badge Selection Rule (|Δ|)</h3>
                <p className="help-text">
                  A film often has 10–20 TMDB keywords. MovieNights sorts all matching keywords by <strong>Absolute Opinion Magnitude (|Δ|)</strong>:
                </p>
                <div className="help-formula-box">
                  <span className="code-comment">// The single strongest opinion wins:</span><br />
                  matchedKeywords.sort((a, b) =&gt; Math.abs(b.delta) - Math.abs(a.delta));<br />
                  activeBadge = matchedKeywords[0];
                </div>
                <p className="help-text">
                  If the club is neutral on <em>drama (+0.1★)</em> but obsessed with <em>neo-noir (+0.7★)</em>, the card highlights the theme where our group has the strongest distinct taste.
                </p>
              </div>
            </div>

            {/* Interactive Shrinkage Tool */}
            <div className="help-tool-box">
              <h3 className="help-subheading" style={{ color: 'var(--accent)' }}>
                🧪 Interactive Simulator: Empirical Bayes Shrinkage
              </h3>
              <p className="help-text" style={{ marginBottom: 16 }}>
                Adjust sample size <code>n</code> and raw rating to see how the mathematical prior dampens fluke ratings:
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

            <div className="help-card" style={{ marginTop: 20 }}>
              <h3 className="help-subheading">How Themes Are Used Across the 3 Main Surfaces</h3>
              <div className="help-table-wrap">
                <table className="help-table">
                  <thead>
                    <tr>
                      <th>Surface</th>
                      <th>Application</th>
                      <th>Mathematical Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>🏆 Scoring & Rankings</strong></td>
                      <td>Powers the <strong>Clickable Keyword Leaderboard</strong> and personal voter statistics.</td>
                      <td>Ranks the club's top subgenres and identifies each voter's personal taste profile.</td>
                    </tr>
                    <tr>
                      <td><strong>🎯 Recommendations (Picks)</strong></td>
                      <td>Calculates a bounded <strong>Thematic Bonus</strong> from the top 5 matching tags.</td>
                      <td><code>thematicBonus = avgDelta * (n / (n + 2))</code>, bounded from <strong>-0.60★ to +0.60★</strong>. Heavily weighted in Club DNA!</td>
                    </tr>
                    <tr>
                      <td><strong>🔮 Predictions & Tonight's Session</strong></td>
                      <td>Adjusts each individual attendee's predicted score based on their personal taste delta for those keywords.</td>
                      <td><code>voterKwBonus = clamp(avgVoterDelta, -0.4, +0.4)</code> applied directly to each viewer's expected satisfaction.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ===================== TAB: THE 4 VIBES ===================== */}
        {activeTab === 'vibes' && (
          <section className="help-section fade-in">
            <div className="help-card hero-card">
              <div className="help-card-header">
                <span className="help-card-icon">🎭</span>
                <div>
                  <h2 className="help-card-title">The 4 Vibe Presets: Deep Dive</h2>
                  <p className="help-card-sub">Dynamic predictive lenses that re-rank the catalog for tonight's atmosphere</p>
                </div>
              </div>
              <p>
                Vibes in MovieNights are <strong>not static categories or tags</strong>. They are <strong>mathematical scoring lenses</strong>. Switching a vibe recalculates the Bayesian expected satisfaction and attendee consensus for every single candidate film in real time.
              </p>
            </div>

            <div className="help-grid-2">
              {/* Crowd Pleaser */}
              <div className="help-card vibe-card-safe">
                <div className="help-card-header">
                  <span className="help-card-icon">🛡️</span>
                  <div>
                    <h3 className="help-card-title" style={{ color: '#34d399' }}>Crowd Pleaser</h3>
                    <p className="help-card-sub">Zero-Risk Consensus · Outside-In Acclaim</p>
                  </div>
                </div>
                <p className="help-text">
                  <strong>Philosophy:</strong> Prioritizes global Letterboxd critical acclaim and guaranteed satisfaction floor. Protects against anyone having a bad time.
                </p>
                <div className="help-formula-box">
                  <span className="code-comment">// Picks Weights:</span><br />
                  Letterboxd Acclaim: 55%<br />
                  Expected Club Avg:  25%<br />
                  Director Track:     20%<br />
                  Thematic Match:      4%<br /><br />
                  <span className="code-comment">// Session Consensus:</span><br />
                  60% Avg Satisfaction + 40% Worst-Case Floor - (Spread * 0.14)
                </div>
                <div className="help-tag-row">
                  <span className="help-pill">💡 Best For: Mixed groups, casual nights, guests, zero controversy</span>
                  <span className="help-pill badge-green">🛡️ Crowd Pleaser (Consensus)</span>
                </div>
              </div>

              {/* Club DNA */}
              <div className="help-card vibe-card-dna">
                <div className="help-card-header">
                  <span className="help-card-icon">🎬</span>
                  <div>
                    <h3 className="help-card-title" style={{ color: '#60a5fa' }}>Club DNA</h3>
                    <p className="help-card-sub">Our Signature Taste · Inside-Out Group Obsessions</p>
                  </div>
                </div>
                <p className="help-text">
                  <strong>Philosophy:</strong> Heavily elevates our club's unique historical director obsessions and Top 10 masterworks, regardless of whether it matches mainstream acclaim.
                </p>
                <div className="help-formula-box">
                  <span className="code-comment">// Picks Weights:</span><br />
                  Director Track:     60%<br />
                  Thematic Fit:       20%<br />
                  Letterboxd Acclaim: 15%<br />
                  Expected Club Avg:  15%<br />
                  Top 10 Halo Boost:  2.0x Multiplier!<br /><br />
                  <span className="code-comment">// Session Consensus:</span><br />
                  75% Avg + 25% Floor + (+0.45 Masterwork) - (Spread * 0.08)
                </div>
                <div className="help-tag-row">
                  <span className="help-pill">💡 Best For: Core Movie Nights celebrating our signature auteur taste</span>
                  <span className="help-pill badge-blue">🎬 Masterwork Pick / Club DNA Pick</span>
                </div>
              </div>

              {/* Fresh Gems */}
              <div className="help-card vibe-card-gems">
                <div className="help-card-header">
                  <span className="help-card-icon">💎</span>
                  <div>
                    <h3 className="help-card-title" style={{ color: '#a78bfa' }}>Fresh Gems</h3>
                    <p className="help-card-sub">Unrated Discoveries · High Critical Acclaim</p>
                  </div>
                </div>
                <p className="help-text">
                  <strong>Philosophy:</strong> Overlooked masterworks that nobody (or almost nobody) in our club has rated yet, boasting top-tier Letterboxd pedigree.
                </p>
                <div className="help-formula-box">
                  <span className="code-comment">// Picks Weights:</span><br />
                  Letterboxd Acclaim: 65%<br />
                  Decade Era Score:   20%<br />
                  Director History:   15%<br />
                  Strict Filter:      maxVoters = 0 (strictly unrated!)<br /><br />
                  <span className="code-comment">// Session Consensus:</span><br />
                  65% Avg Satisfaction + 35% Floor - (Spread * 0.10)
                </div>
                <div className="help-tag-row">
                  <span className="help-pill">💡 Best For: When attendees want a fresh masterpiece discovery together</span>
                  <span className="help-pill badge-purple">💎 Hidden Gem</span>
                </div>
              </div>

              {/* Wildcard */}
              <div className="help-card vibe-card-wildcard">
                <div className="help-card-header">
                  <span className="help-card-icon">⚡</span>
                  <div>
                    <h3 className="help-card-title" style={{ color: '#f87171' }}>Wildcard</h3>
                    <p className="help-card-sub">Sparks & Debates · Era-Spanning Discussion</p>
                  </div>
                </div>
                <p className="help-text">
                  <strong>Philosophy:</strong> Daring, polarizing cinema spanning distant decades that invites strong conflicting opinions and fiery post-movie debates.
                </p>
                <div className="help-formula-box">
                  <span className="code-comment">// Picks Weights:</span><br />
                  Decade Era Exploration: 45%<br />
                  Director Track:         35%<br />
                  Letterboxd Acclaim:     20%<br />
                  Top 10 Halo Bias:        0%<br /><br />
                  <span className="code-comment">// Session Consensus:</span><br />
                  75% Avg Satisfaction + (Spread * 0.22) -&gt; Rewards Divergence!
                </div>
                <div className="help-tag-row">
                  <span className="help-pill">💡 Best For: Heated, passionate post-movie discussion instead of polite agreement</span>
                  <span className="help-pill badge-red">⚡ High Spark (Spread: X★)</span>
                </div>
              </div>
            </div>

            <div className="help-callout" style={{ marginTop: 20 }}>
              <strong>⚖️ Outside-In vs. Inside-Out Summary:</strong><br />
              • <strong>Crowd Pleaser (Outside-In)</strong> protects against anyone disliking the pick by anchoring on global Letterboxd acclaim with a high consensus floor.<br />
              • <strong>Club DNA (Inside-Out)</strong> is purely fueled by our group's own historical favorites, auteur loyalty, and member Top 10 lists.
            </div>
          </section>
        )}

        {/* ===================== TAB: BAYESIAN ENGINE ===================== */}
        {activeTab === 'bayesian' && (
          <section className="help-section fade-in">
            <div className="help-card hero-card">
              <div className="help-card-header">
                <span className="help-card-icon">🔮</span>
                <div>
                  <h2 className="help-card-title">The Bayesian Prior & Blending Model</h2>
                  <p className="help-card-sub">How MovieNights transitions smoothly from expectation to empirical ratings</p>
                </div>
              </div>
              <p>
                The model avoids binary jumps. When a film has zero club ratings, predictions rely on a multi-factor <strong>Bayesian Prior</strong>. As members watch and rate the film, confidence shifts toward actual votes.
              </p>
            </div>

            <div className="help-grid-2">
              <div className="help-card">
                <h3 className="help-subheading">1. Formulation of the Prior</h3>
                <div className="help-formula-box">
                  <span className="code-comment">// 1. Weighted Baseline Anchor:</span><br />
                  base = (dirAvg * dw + lbScore * lbw + decAvg * ew) / totalActiveWeight<br /><br />
                  <span className="code-comment">// 2. Top 10 Halo Boost:</span><br />
                  haloBoost = priorPoints * (1 + 0.20 * (uniqueFilms - 1)) * twRate<br /><br />
                  <span className="code-comment">// 3. Thematic Bonus:</span><br />
                  thematicBonus = clamp(avgMatchedDelta, -0.60, +0.60)<br /><br />
                  <span className="code-comment">// Combined Prior:</span><br />
                  prior = clamp(base + haloBoost + thematicBonus, 1.0, 10.0)
                </div>
              </div>

              <div className="help-card">
                <h3 className="help-subheading">2. The Confidence Transition</h3>
                <div className="help-formula-box">
                  confidence = voterCount / groupSize;<br />
                  predictedScore = (confidence * actualScore) + ((1 - confidence) * prior);
                </div>
                <ul className="help-list" style={{ marginTop: 14 }}>
                  <li><strong>0 Votes:</strong> 100% Prior expectation.</li>
                  <li><strong>2 Votes (40% of club):</strong> 40% real ratings + 60% prior.</li>
                  <li><strong>5 Votes (100% of club):</strong> 100% actual Fair Score.</li>
                </ul>
              </div>
            </div>

            {/* Interactive Confidence Simulator */}
            <div className="help-tool-box" style={{ marginTop: 20 }}>
              <h3 className="help-subheading" style={{ color: 'var(--accent)' }}>
                🧪 Interactive Simulator: Bayesian Confidence Blend
              </h3>
              <p className="help-text" style={{ marginBottom: 16 }}>
                Simulate how the prediction shifts between Prior and Actual score as club members log their ratings:
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
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                    {Math.round((1 - confidence) * 100)}% Prior · {Math.round(confidence * 100)}% Actual
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ===================== TAB: TONIGHT'S CONSENSUS ===================== */}
        {activeTab === 'session' && (
          <section className="help-section fade-in">
            <div className="help-card hero-card">
              <div className="help-card-header">
                <span className="help-card-icon">🍿</span>
                <div>
                  <h2 className="help-card-title">Tonight's Session Planner & Consensus Formula</h2>
                  <p className="help-card-sub">Scoring films dynamically based on who is in the room tonight</p>
                </div>
              </div>
              <p>
                In <strong>Tonight's Session</strong>, predictions are tailored specifically to the selected attendees present in the room. The system balances collective satisfaction, worst-case viewer protection, and taste divergence.
              </p>
            </div>

            <div className="help-grid-2">
              <div className="help-card">
                <h3 className="help-subheading">Personal Attendee Prediction Components</h3>
                <ul className="help-list">
                  <li>
                    <strong>Director Track (55%) + Decade Affinity (45%):</strong> Evaluated strictly on each attendee's personal historical ratings.
                  </li>
                  <li>
                    <strong>Personal Thematic Modifier (±0.4★):</strong> Modulates prediction based on this attendee's taste for the film's TMDB keywords.
                  </li>
                  <li>
                    <strong>Top 10 Director (+0.4★):</strong> Bonus added if the director is in this attendee's Top 10 list.
                  </li>
                  <li>
                    <strong>Watchlist Vote (+0.3★):</strong> Added if this attendee actively voted for this film on the watchlist.
                  </li>
                </ul>
              </div>

              <div className="help-card">
                <h3 className="help-subheading">Synergy Modifiers & Novelty Discounts</h3>
                <ul className="help-list">
                  <li>
                    <strong>Unanimous Watchlist (+0.35★):</strong> Awarded when 100% of tonight's attendees have the film on their watchlist.
                  </li>
                  <li>
                    <strong>Partial Watchlist Synergy:</strong> Scales proportionally: <code>+(attendeesOnWl / total) * 0.20★</code>.
                  </li>
                  <li>
                    <strong>Re-watch Novelty Discount (-0.60★):</strong> In 'All' mode, applies a penalty if 100% of attendees have already seen it, ensuring great re-watches don't drown out fresh discoveries.
                  </li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* ===================== TAB: ACCURACY & RETROSPECTIVE ===================== */}
        {activeTab === 'accuracy' && (
          <section className="help-section fade-in">
            <div className="help-card hero-card">
              <div className="help-card-header">
                <span className="help-card-icon">🎯</span>
                <div>
                  <h2 className="help-card-title">Accuracy & Retrospective (Predictions Page)</h2>
                  <p className="help-card-sub">Leave-One-Out cross validation proving model calibration</p>
                </div>
              </div>
              <p>
                The <strong>Accuracy / Predictions</strong> page rigorously backtests our scoring engine against every film the club has ever rated using <strong>Leave-One-Out (LOO) cross validation</strong>.
              </p>
            </div>

            <div className="help-grid-2">
              <div className="help-card">
                <h3 className="help-subheading">Leave-One-Out (LOO) Integrity</h3>
                <p className="help-text">
                  When testing what the model would have predicted for a movie (e.g., <em>Parasite</em>), the system completely excludes <em>Parasite</em> from Bong Joon-ho's director track record, the 2010s decade average, and its keyword statistics.
                </p>
                <div className="help-formula-box">
                  <span className="code-comment">// No data leakage:</span><br />
                  otherDirFilms = dirFilms.filter(f =&gt; f.id !== target.id);<br />
                  otherKwFilms  = kwFilms.filter(f =&gt; f.id !== target.id);<br />
                  error = |actualClubScore - priorScore|
                </div>
              </div>

              <div className="help-card">
                <h3 className="help-subheading">Accuracy Verdict Categories</h3>
                <table className="help-table">
                  <tbody>
                    <tr>
                      <td><span className="help-pill badge-green">🎯 Bullseye</span></td>
                      <td>Within <strong>0.5★</strong> of actual club rating. Highly calibrated!</td>
                    </tr>
                    <tr>
                      <td><span className="help-pill badge-blue">▲ Beat Prior</span></td>
                      <td>Rated <strong>0.5★ to 0.9★</strong> above prior expectation.</td>
                    </tr>
                    <tr>
                      <td><span className="help-pill badge-gold">🌟 Pleasantly Surprised</span></td>
                      <td>Club loved it <strong>≥ 1.0★</strong> above expectation!</td>
                    </tr>
                    <tr>
                      <td><span className="help-pill badge-red">📉 Underperformed</span></td>
                      <td>Club rated <strong>≥ 1.0★</strong> below prior expectation.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ===================== TAB: FAIR SCORES & TOP 10S ===================== */}
        {activeTab === 'scoring' && (
          <section className="help-section fade-in">
            <div className="help-card hero-card">
              <div className="help-card-header">
                <span className="help-card-icon">🏆</span>
                <div>
                  <h2 className="help-card-title">Fair Score & Top-10 Bonus Mechanics</h2>
                  <p className="help-card-sub">The mathematical foundation of club rankings and leaderboards</p>
                </div>
              </div>
              <p>
                MovieNights ranks films not by a naive raw average, but through a <strong>Fair Boosted Score</strong> that combines democratic consensus with personal Top 10 bonuses.
              </p>
            </div>

            <div className="help-grid-2">
              <div className="help-card">
                <h3 className="help-subheading">1. Top-10 Rank Bonus (Linear Decay)</h3>
                <p className="help-text">
                  When a voter places a movie in their personal Top 10 list, it earns a permanent boost reflecting their deep passion:
                </p>
                <div className="help-formula-box">
                  <span className="code-comment">// Rank Bonus Formula:</span><br />
                  rankBonus(rank) = (11 - rank) / 10;<br /><br />
                  Rank #1  -&gt; +1.0 ★<br />
                  Rank #2  -&gt; +0.9 ★<br />
                  Rank #3  -&gt; +0.8 ★<br />
                  ...<br />
                  Rank #10 -&gt; +0.1 ★
                </div>
              </div>

              <div className="help-card">
                <h3 className="help-subheading">2. Fair Boosted Score Formula</h3>
                <div className="help-formula-box">
                  fairAvg = sum(ratings) / voterCount;<br />
                  totalBoost = sum(rankBonus(rank) for each Top 10 pick);<br />
                  boostedScore = min(10.0, fairAvg + totalBoost);
                </div>
                <p className="help-text" style={{ marginTop: 12 }}>
                  This guarantees that a film loved moderately by all (e.g. 8.0) can be surpassed by a transcendent masterpiece placed at #1 by multiple members (e.g. 8.0 + 1.0 + 1.0 = 10.0).
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
