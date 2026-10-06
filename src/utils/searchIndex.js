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

export function createSearchIndex(data) {
  const indexSet = new Set();

  const addPrefixes = (text) => {
    const str = String(text).toLowerCase().trim();
    if (!str) return;

    indexSet.add(str);

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
