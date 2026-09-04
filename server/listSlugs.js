const { slugify } = require('./slugify');

// Pick a slug for `title` that nothing else answers to — neither another list's
// current slug nor a parked alias from some earlier rename. Collisions get a
// numeric suffix ("noir-night", "noir-night-2"), the same shape a reader would
// guess. `excludeListId` lets a list keep its own slug when it is re-saved.
//
// Takes the db helpers as an argument so db.js can call it during init()
// without requiring itself back through the routes.
async function uniqueSlug(db, title, excludeListId = null) {
  const base = slugify(title);
  for (let attempt = 1; ; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;

    const owningList = await db.get('SELECT id FROM lists WHERE slug = ?', candidate);
    if (owningList && owningList.id !== excludeListId) continue;

    const alias = await db.get('SELECT list_id FROM list_slug_aliases WHERE slug = ?', candidate);
    if (alias && alias.list_id !== excludeListId) continue;

    return candidate;
  }
}

module.exports = { uniqueSlug };
