// The one definition of a member's search index.
//
// `search_keywords` is what the search box queries (array-contains), so every
// path that writes a member has to build it the same way. It was previously
// duplicated in three places and rebuilt in none of them on edit, which is why
// an edited member stayed findable only under their old details. Keeping the
// builder AND the field list here means create, approve, edit and the backfill
// cannot drift apart again.
//
// Pure — no firebase imports — so the server-side backfill can use it too.

// Invisible characters Hindi keyboards slip in (zero-width joiner / non-joiner,
// zero-width space, BOM). They make "रमेश" typed on one phone differ from
// "रमेश" saved from another, so both the index and the query drop them.
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/g;
const tidy = (v) => String(v ?? '').normalize('NFC').replace(INVISIBLE, '').toLowerCase().trim();

/**
 * The search box text → the value matched against `search_keywords`.
 *
 * It used to be `.replace(/[^a-z0-9]/g, '')`, which deleted every Hindi letter:
 * "रमेश" became "" and nothing was ever found, although the index holds the
 * Hindi words. Now letters of any script stay; spaces are kept (the index holds
 * each full field, e.g. the full name "रमेश कुमार", as well as every word and
 * prefix). A phone / number typed with spaces or dashes is joined back up.
 */
export function normalizeSearchTerm(text) {
  const s = tidy(text).replace(/\s+/g, ' ');
  if (!s) return '';
  if (/^[\d\s\-+().]+$/.test(s)) return s.replace(/\D/g, '');
  return s;
}

export function createSearchIndex(data) {
  const indexSet = new Set();

  const addPrefixes = (text) => {
    const str = tidy(text).replace(/\s+/g, ' ');
    if (!str) return;

    indexSet.add(str);

    // Whole-value prefixes too, so a search with a space in it works while it
    // is being typed: "रमेश कु", "ramesh ku" → "रमेश कुमार प्रजापत".
    if (str.includes(' ')) {
      let prefix = '';
      for (const ch of str) {
        prefix += ch;
        if (prefix.length > 1 && !prefix.endsWith(' ')) indexSet.add(prefix);
      }
    }

    str.split(/\s+/).forEach(word => {
      if (word.length > 1) {
        indexSet.add(word);
        let prefix = '';
        for (const ch of word) {
          prefix += ch;
          if (prefix.length > 1) indexSet.add(prefix);
        }
      }
    });
  };

  const traverse = (value) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'object') {
      if (Array.isArray(value)) value.forEach(traverse);
      else Object.values(value).forEach(traverse);
    } else {
      addPrefixes(value);
    }
  };

  traverse(data);
  return Array.from(indexSet).filter(item => item.length > 0);
}

// Which fields of a member doc go into the index.
//
// Takes the stored member document, so the backfill can rebuild any member's
// index without knowing anything about the form that last saved them.
export const memberSearchFields = (m = {}) => ({
  name:                m.displayName || m.name,
  fatherName:          m.fatherName,
  surname:             m.surname,
  phone:               m.phone,
  phoneAlt:            m.phoneAlt,
  aadhaarNo:           m.aadhaarNo,
  registrationNumber:  m.registrationNumber,
  legacyApplicationNo: m.legacyApplicationNo,
  village:             m.village,
  city:                m.city,
  district:            m.district,
  state:               m.state,
  caste:               m.caste,
  guardian:            m.guardian,
  programName:         m.programName,
  ageGroupName:        m.ageGroupName,
});

// Rebuild straight from a stored member document.
export const buildMemberSearchIndex = (member) =>
  createSearchIndex(memberSearchFields(member));

// Order-insensitive comparison, so the backfill only writes members whose index
// genuinely changed instead of rewriting every document on every run.
export const sameIndex = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
};
