const SANDBOX_MODE = process.env.SANDBOX_MODE === 'true';
const SANDBOX_VOTER = process.env.SANDBOX_VOTER || (SANDBOX_MODE ? 'Κλαίρη' : '');
const defaultVoters = SANDBOX_MODE
  ? 'Μητσέας,Παντελής,Στέλιας,Φώτης,Λεόντιος,Κλαίρη'
  : 'Μητσέας,Παντελής,Στέλιας,Φώτης,Λεόντιος';
const defaultGroupSize = SANDBOX_MODE ? '6' : '5';

const VOTERS = (process.env.VOTERS || defaultVoters)
  .split(',').map(v => v.trim()).filter(Boolean);
const GROUP_SIZE = parseInt(process.env.GROUP_SIZE || defaultGroupSize, 10);
const MIN_VOTERS = Math.min(2, GROUP_SIZE);

const HIDE_HAL = process.env.HIDE_HAL === 'true' || process.env.ENABLE_HAL === 'false';
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || (SANDBOX_MODE ? 'mn_v6_sid' : 'mn_sid');

module.exports = {
  VOTERS,
  GROUP_SIZE,
  MIN_VOTERS,
  SANDBOX_MODE,
  SANDBOX_VOTER,
  HIDE_HAL,
  SESSION_COOKIE_NAME,
};

