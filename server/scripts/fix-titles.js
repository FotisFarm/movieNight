const db = require('../db');

const fixes = [
  ['Breathlless',                                          'Breathless'],
  ['Intorelable Cruelty',                                  'Intolerable Cruelty'],
  ['The Ballad of Bluster Scruggs',                        'The Ballad of Buster Scruggs'],
  ['Blue Jasmin',                                          'Blue Jasmine'],
  ['Bullets over Brodway',                                 'Bullets over Broadway'],
  ['Vicky Christina Barcelona',                            'Vicky Cristina Barcelona'],
  ['2001: A Space Oddysey',                                '2001: A Space Odyssey'],
  ['The Dark Khight',                                      'The Dark Knight'],
  ['The Dark Khight Rises',                                'The Dark Knight Rises'],
  ['Strangers os a Train',                                 'Strangers on a Train'],
  ['Stage Fight',                                          'Stage Fright'],
  ['Stage Stuck',                                          'Stage Struck'],
  ['8,5',                                                  '8½'],
  ['And the Ship SailsOn',                                 'And the Ship Sails On'],
  ['Felini Satyricon',                                     'Fellini Satyricon'],
  ['The People vs. Larry Flint',                           'The People vs. Larry Flynt'],
  ['One Wonderfull Sunday',                                'One Wonderful Sunday'],
  ['Yohimbo',                                              'Yojimbo'],
  ['Bye Bye Braveman',                                     'Bye Bye Braverman'],
  ['The Paraduine Case',                                   'The Paradine Case'],
  ['Tou va bien',                                          'Tout va bien'],
  ['Masculin Fémimin',                                     'Masculin Féminin'],
  ['The Fablemans',                                        'The Fabelmans'],
  ['Indiana Jones snd the Kindom of the Crystal Skull',    'Indiana Jones and the Kingdom of the Crystal Skull'],
  ['E.T the Extra-Terrestial',                             'E.T. the Extra-Terrestrial'],
  ['A.I Artificial Intelligence',                          'A.I. Artificial Intelligence'],
  ['G.I Jane',                                             'G.I. Jane'],
  ['The Duelists',                                         'The Duellists'],
  ['Three Colours: Blue',                                  'Three Colors: Blue'],
  ['Three Colours: White',                                 'Three Colors: White'],
  ['Three Colours:Red',                                    'Three Colors: Red'],
];

const stmt = db.prepare('UPDATE movies SET title = ? WHERE title = ?');
for (const [old, neu] of fixes) {
  const { changes } = stmt.run(neu, old);
  console.log(changes ? `✓ ${old} → ${neu}` : `✗ not found: ${old}`);
}
