// Ajoute à films.json un champ "casting" (acteurs du moins connu au plus connu, avec photo TMDB).
// Usage (dans le dossier de films.json) :   node tmdb_casting.js TA_CLE_TMDB
//   --force    refait aussi les films qui ont déjà un casting
// Clé : la "clé API (v3)" ou le "jeton d'accès" (commence par eyJ) de ton compte TMDB. Node 18+ requis.
const fs = require('fs');
const KEY = process.argv[2], FORCE = process.argv.includes('--force');
if (!KEY) { console.error('Usage : node tmdb_casting.js TA_CLE_TMDB'); process.exit(1); }
// Films que la recherche par titre ne trouve pas : identifiant TMDB (visible dans l'URL themoviedb.org/movie/<id>)
const IDS = { "Indiana Jones et les Aventuriers de l'Arche Perdue": 85, 'Indiana Jones et le Cadran de la destinée': 335977 };
const NB = 5, IMG = 'https://image.tmdb.org/t/p/w185';
const bearer = KEY.startsWith('eyJ');
async function api(path, params = {}) {
  const u = new URL('https://api.themoviedb.org/3' + path);
  if (!bearer) u.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, bearer ? { headers: { Authorization: 'Bearer ' + KEY } } : {});
  if (!r.ok) throw new Error(path + ' → HTTP ' + r.status);
  return r.json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const films = JSON.parse(fs.readFileSync('films.json', 'utf8'));
  const echecs = [];
  for (const f of films) {
    if (f.casting && f.casting.length && !FORCE) continue;
    try {
      let res = IDS[f.titre] ? [{ id: IDS[f.titre] }] : [];
      if (!res.length) for (const lang of ['fr-FR', 'en-US']) {
        res = (await api('/search/movie', { query: f.titre, language: lang })).results || [];
        res = res.filter(m => m.release_date && Math.abs(+m.release_date.slice(0, 4) - f.annee) <= 1);
        if (res.length) break;
      }
      if (!res.length) { echecs.push(f.titre + ' (film introuvable)'); continue; }
      const credits = await api('/movie/' + res[0].id + '/credits');
      const top = (credits.cast || []).filter(a => a.profile_path).slice(0, NB)        // têtes d'affiche avec photo
        .sort((a, b) => a.popularity - b.popularity);                                   // du moins au plus connu
      if (top.length < 3) { echecs.push(f.titre + ' (moins de 3 photos)'); }
      f.casting = top.map(a => ({ nom: a.name, photo: IMG + a.profile_path }));
      console.log('✔', f.titre, '→', f.casting.map(a => a.nom).join(', '));
    } catch (e) { echecs.push(f.titre + ' (' + e.message + ')'); }
    await sleep(120);
  }
  fs.writeFileSync('films.json', JSON.stringify(films, null, 2));
  console.log('\nTerminé. ' + films.filter(f => f.casting && f.casting.length).length + '/' + films.length + ' films avec casting.');
  if (echecs.length) console.log('À vérifier :\n- ' + echecs.join('\n- '));
})();
