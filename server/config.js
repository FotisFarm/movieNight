const VOTERS = (process.env.VOTERS || 'Μητσέας,Παντελής,Στέλιας,Φώτης,Λεόντιος')
  .split(',').map(v => v.trim()).filter(Boolean);
const GROUP_SIZE = parseInt(process.env.GROUP_SIZE || '5', 10);
const MIN_VOTERS = Math.min(2, GROUP_SIZE); // minimum voters to show a group score
module.exports = { VOTERS, GROUP_SIZE, MIN_VOTERS };
