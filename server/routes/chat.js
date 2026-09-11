const express = require('express');
const router = express.Router();
const llm = require('../llm');
const ah = require('../asyncHandler');
const { HIDE_HAL } = require('../config');

// POST /api/chat  { messages: [{ role, content }] }  ->  { reply }
// Mounted behind requireAuth, so req.session.voter is always set.
router.post('/', ah(async (req, res) => {
  if (HIDE_HAL) {
    return res.status(404).json({ error: 'Chat is currently disabled.' });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }

  const clean = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content }));

  if (clean.length === 0) {
    return res.status(400).json({ error: 'no valid messages' });
  }

  // Errors are returned as a normal reply bubble so the UI renders them inline.
  const { reply, queries } = await llm.chat({ messages: clean, voter: req.session.voter });
  res.json({ reply, queries: queries || [] });
}));

module.exports = router;
