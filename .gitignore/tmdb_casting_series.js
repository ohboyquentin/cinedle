// Ajoute à series.json un champ "casting" (acteurs du moins connu au plus connu, avec photo TMDB).
// Usage (dans le dossier de series.json) :   node tmdb_casting_series.js TA_CLE_TMDB
//   --force    refait aussi les séries qui ont déjà un casting
// Clé : la "clé API (v3)" ou le "jeton d'accès" (commence par eyJ) de ton compte TMDB. Node 18+ requis.
const fs = require('fs');
const KEY = process.argv[2], FORCE = process.argv.includes('--force');
if (!KEY) { console.error('Usage : node tmdb_casting_series.js 7b93f0fa13f72fcb119edf78b8d384b4'); process.exit(1); }
// Séries que la recherche par titre ne trouve pas : identifiant TMDB (visible dans l'URL themoviedb.org/tv/<id>)
const IDS = {};
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
  const series = JSON.parse(fs.readFileSync('series.json', 'utf8'));
  const echecs = [];
  for (const s of series) {
    if (s.casting && s.casting.length && !FORCE) continue;
    try {
      let res = IDS[s.titre] ? [{ id: IDS[s.titre] }] : [];
      // on essaie le titre complet, puis le titre avant « : » (ex. « Suits : Avocats sur Mesure » → « Suits »)
      const requetes = [...new Set([s.titre, s.titre.split(' : ')[0]])];
      if (!res.length) for (const q of requetes) for (const lang of ['fr-FR', 'en-US']) {
        res = (await api('/search/tv', { query: q, language: lang })).results || [];
        res = res.filter(m => m.first_air_date && Math.abs(+m.first_air_date.slice(0, 4) - s.annee_debut) <= 1);
        if (res.length) break;
      }
      if (!res.length) { echecs.push(s.titre + ' (série introuvable)'); continue; }
      const credits = await api('/tv/' + res[0].id + '/aggregate_credits');
      const top = (credits.cast || []).filter(a => a.profile_path).slice(0, NB)     // têtes d'affiche avec photo
        .sort((a, b) => a.popularity - b.popularity);                                // du moins au plus connu
      if (top.length < 3) echecs.push(s.titre + ' (moins de 3 photos)');
      s.casting = top.map(a => ({ nom: a.name, photo: IMG + a.profile_path }));
      console.log('✔', s.titre, '→', s.casting.map(a => a.nom).join(', '));
    } catch (e) { echecs.push(s.titre + ' (' + e.message + ')'); }
    await sleep(120);
  }
  fs.writeFileSync('series.json', JSON.stringify(series, null, 2));
  console.log('\nTerminé. ' + series.filter(s => s.casting && s.casting.length).length + '/' + series.length + ' séries avec casting.');
  if (echecs.length) console.log('À vérifier :\n- ' + echecs.join('\n- '));
})();
