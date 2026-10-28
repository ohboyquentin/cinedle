// Télécharge un extrait officiel de 30 s (API iTunes Search, gratuite, sans clé) pour :
//   - films_animation.json  → champ "musique"   → assets/audio/musiques/<slug>.m4a
//   - series.json           → champ "generique" → assets/audio/generiques/<slug>.m4a
//   - animes.json           → champ "opening"   → assets/audio/openings/<slug>.m4a
// et met à jour "extrait_audio" dans le JSON.
//
// Animation : pour les films dont les chansons sont doublées (Disney, Pixar, DreamWorks…, liste VF_IDS plus bas),
// le script cherche la VERSION FRANÇAISE dans l'album « bande originale française » du film, et met à jour le titre
// et l'interprète du JSON avec ce qu'il a trouvé. Les autres (Ghibli, chansons pop originales…) ne changent pas.
//
// Usage (dans le dossier qui contient les JSON) :   node itunes_audio.js
//   --force            refait aussi les extraits déjà téléchargés
//   --only=animation   (ou series, animes) pour ne traiter qu'un thème
//   --ids=anim_004,anim_008   pour ne refaire que ces films (animation)
// Si un titre français n'est pas reconnu, le rapport audio_a_verifier.txt liste les pistes de l'album français :
// renvoie-le moi, je te donne un petit fichier vf_choix.json à déposer à côté du script puis tu relances.
// Node 18+ requis.
const fs = require('fs');
const FORCE = process.argv.includes('--force');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);

const THEMES = [
  { nom: 'animation', fichier: 'films_animation.json', champ: 'musique',   dossier: 'assets/audio/musiques',   pays: ['fr', 'us'] },
  { nom: 'series',    fichier: 'series.json',          champ: 'generique', dossier: 'assets/audio/generiques', pays: ['us', 'fr'] },
  { nom: 'animes',    fichier: 'animes.json',          champ: 'opening',   dossier: 'assets/audio/openings',   pays: ['jp', 'us', 'fr'] },
];

// Films d'animation dont la chanson existe en version française doublée
const VF_IDS = new Set([
  ...['001','002','003','004','005','006','008','009','010','011','012','013','014','015','016','017','018','019','020',
      '021','024','026','029','030','032','034','043','046','047','050','058','073','095','097','098','099',
      '101','102','104','109','113','115','117','118','121','122','142'].map(n => 'anim_' + n),
]);
// vf_choix.json : { "anim_017 · Pocahontas": "L'air du vent" }  (seul l'identifiant avant l'espace compte ; le nom du film est là pour t'aider)
const CHOIX = {};
if (fs.existsSync('vf_choix.json')) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync('vf_choix.json', 'utf8')))) CHOIX[k.split(/\s/)[0]] = v;
const ONLY_IDS = (process.argv.find(a => a.startsWith('--ids=')) || '').slice(6).split(',').filter(Boolean);   // ex. --ids=anim_004,anim_008
if (fs.existsSync('vf_choix.json')) {      // avec vf_choix.json : version française UNIQUEMENT pour les films dont un titre est rempli ; les autres gardent la musique originale
  VF_IDS.clear();
  for (const [id, v] of Object.entries(CHOIX)) if (v && v.trim()) VF_IDS.add(id);
}
const DONE_FILE = '.vf_done.json';
const VF_DONE = new Set(fs.existsSync(DONE_FILE) ? JSON.parse(fs.readFileSync(DONE_FILE, 'utf8')) : []);

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const placeholder = s => /\[Ajouter/i.test(s || '');
const enc = encodeURIComponent;

async function get(url, binaire) {
  for (let essai = 0; essai < 4; essai++) {
    const r = await fetch(url);
    if (r.ok) return binaire ? Buffer.from(await r.arrayBuffer()) : r.json();
    if (r.status === 403 || r.status === 429 || r.status >= 500) { await sleep(8000 * (essai + 1)); continue; }  // limite de débit
    throw new Error('HTTP ' + r.status);
  }
  throw new Error('trop de refus (limite de débit iTunes)');
}
const api = async url => { const j = await get(url); await sleep(3200); return j.results || []; };   // ~19 requêtes/min max côté iTunes

// ---------- recherche « classique » (séries, animés, animation non doublée) ----------
function titreOk(nom, titre) {
  if (nom === titre || nom.includes(titre)) return true;
  return nom.length >= 4 && titre.includes(nom) && nom.length >= 0.7 * titre.length;   // évite « Mine » ⊂ « Bébé mine »
}
async function chercher(oeuvre, m, pays) {
  const titre = norm(m.titre), oeuvreN = norm(oeuvre);
  const artistes = placeholder(m.artiste) ? [] : m.artiste.split(/ et | & |, | feat\.? /i).map(norm).filter(a => a.length > 2);
  const requetes = [`${m.titre} ${placeholder(m.artiste) ? oeuvre : m.artiste}`, `${m.titre} ${oeuvre}`, m.titre];
  let meilleur = { score: 0 };
  for (const p of pays) for (const q of requetes) {
    let res; try { res = await api('https://itunes.apple.com/search?media=music&entity=song&limit=15&country=' + p + '&term=' + enc(q)); } catch (e) { res = []; }
    for (const c of res) {
      if (!c.previewUrl) continue;
      const nom = norm(c.trackName), art = norm(c.artistName), alb = norm(c.collectionName);
      if (!titreOk(nom, titre)) continue;
      const okArt = artistes.some(a => art.includes(a) || a.includes(art));
      const okAlb = oeuvreN.length > 2 && (alb.includes(oeuvreN) || nom.includes(oeuvreN));
      const score = (okArt || okAlb) ? 2 : 1;
      if (score > meilleur.score) meilleur = { score, url: c.previewUrl, label: `${c.trackName} — ${c.artistName} (${c.collectionName})` };
    }
    if (meilleur.score === 2) return meilleur;
  }
  return meilleur;
}

// ---------- recherche « version française » (animation doublée) ----------
const propre = s => s.replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\s+[-–]\s+(version|from|extrait|de la).*$/i, '').replace(/\s+/g, ' ').trim();
const mots = s => new Set(norm(s).split(' ').filter(w => w.length > 1));
function sim(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const A = mots(a), B = mots(b); let i = 0; A.forEach(w => { if (B.has(w)) i++; });
  return i / (A.size + B.size - i || 1);
}
const collectif = a => /various|divers|cast|distribution|original|choeur|chœur|orchestre/i.test(a || '');
async function chercherVF(film, m, choix) {
  const coeur = norm(film.titre.split(/[:,]/)[0]).replace(/^(le |la |les |l )/, '');
  const albums = [];
  for (const q of [`${film.titre} bande originale française`, `${film.titre} bande originale du film`]) {
    let res; try { res = await api('https://itunes.apple.com/search?media=music&entity=album&limit=15&country=fr&term=' + enc(q)); } catch (e) { res = []; }
    for (const a of res) if (norm(a.collectionName).includes(coeur) && !albums.some(x => x.collectionId === a.collectionId)) albums.push(a);
    if (albums.some(a => /francaise|version fr|\bvf\b/i.test(norm(a.collectionName)))) break;
  }
  const rang = a => (/francaise|version fr|\bvf\b/i.test(norm(a.collectionName)) ? 0 : 1);
  albums.sort((a, b) => rang(a) - rang(b));
  if (!albums.length) return { statut: 'sans_album' };
  const pistes = [];
  for (const a of albums.slice(0, 3)) {
    let res; try { res = await api('https://itunes.apple.com/lookup?entity=song&limit=60&country=fr&id=' + a.collectionId); } catch (e) { res = []; }
    for (const t of res) if (t.wrapperType === 'track' && t.previewUrl) pistes.push({ ...t, album: a.collectionName });
    if (rang(a) === 0 && pistes.length) break;          // un album « française » suffit
  }
  if (!pistes.length) return { statut: 'sans_album' };
  const cible = choix || m.titre;
  const note = t => sim(propre(t.trackName), cible);
  const best = pistes.slice().sort((a, b) => note(b) - note(a))[0];
  if (note(best) >= 0.6) return { statut: 'ok', piste: best };
  return { statut: 'choisir', pistes: pistes.map(t => propre(t.trackName) + (collectif(t.artistName) ? '' : ' — ' + t.artistName)) };
}

(async () => {
  const rapport = { verifier: [], introuvable: [], completer: [], ok: 0, vf: 0, choisir: [], sansAlbum: [], artiste: [] };
  for (const T of THEMES) {
    if (ONLY && ONLY !== T.nom) continue;
    let texte = fs.readFileSync(T.fichier, 'utf8');
    const data = JSON.parse(texte);
    fs.mkdirSync(T.dossier, { recursive: true });
    console.log(`\n== ${T.nom} (${data.length}) ==`);
    const sauve = () => {      // animation : le JSON est réécrit tel quel (même mise en forme) ; séries/animés : on remplace juste le chemin
      if (T.nom === 'animation') fs.writeFileSync(T.fichier, JSON.stringify(data, null, 2));
      else fs.writeFileSync(T.fichier, texte);
    };
    for (const x of data) {
      if (ONLY_IDS.length && !ONLY_IDS.includes(x.id)) continue;
      const m = x[T.champ];
      if (!m || placeholder(m.titre)) { rapport.completer.push(`${T.nom} · ${x.titre} : ${m ? m.titre + ' / ' + m.artiste : 'champ absent'}`); continue; }
      const vf = T.nom === 'animation' && VF_IDS.has(x.id);
      const fichier = `${T.dossier}/${slug(x.titre)}.m4a`;
      const dejaFait = vf ? VF_DONE.has(x.id) : fs.existsSync(fichier);
      if (!FORCE && !ONLY_IDS.length && dejaFait) { rapport.ok++; continue; }
      try {
        let url, score = 2, label = '';
        if (vf) {
          const r = await chercherVF(x, m, CHOIX[x.id]);
          if (r.statut === 'choisir') { rapport.choisir.push(`${x.id} · ${x.titre} (JSON : « ${m.titre} ») → pistes de l'album français : ${r.pistes.join(' | ')}`); console.log('?', x.titre); continue; }
          if (r.statut === 'ok') {
            url = r.piste.previewUrl; m.titre = propre(r.piste.trackName);
            if (collectif(r.piste.artistName)) { m.artiste = '[Ajouter artiste]'; rapport.artiste.push(`${x.titre} : « ${m.titre} » (album : ${r.piste.album}, artiste « ${r.piste.artistName} »)`); }
            else m.artiste = r.piste.artistName;
            label = `VF : ${m.titre} — ${m.artiste}`; rapport.vf++;
          } else {                                      // pas d'album français : recherche classique, à vérifier
            const c = await chercher(x.titre, m, T.pays);
            if (!c.score) { rapport.sansAlbum.push(`${x.id} · ${x.titre} : « ${m.titre} » (rien trouvé)`); console.log('✗', x.titre); continue; }
            url = c.url; score = 1; label = c.label;
            rapport.sansAlbum.push(`${x.id} · ${x.titre} : pas d'album français trouvé, extrait pris = ${c.label}`);
          }
        } else {
          const c = await chercher(x.titre, m, T.pays);
          if (!c.score) { rapport.introuvable.push(`${T.nom} · ${x.titre} : « ${m.titre} » — ${m.artiste}`); console.log('✗', x.titre); continue; }
          url = c.url; score = c.score; label = c.label;
        }
        fs.writeFileSync(fichier, await get(url, true));
        if (m.extrait_audio && m.extrait_audio !== fichier)
          texte = texte.split(JSON.stringify(m.extrait_audio).slice(1, -1)).join(fichier);
        m.extrait_audio = fichier;
        if (vf && score === 2) { VF_DONE.add(x.id); fs.writeFileSync(DONE_FILE, JSON.stringify([...VF_DONE])); }
        if (score === 1 && !vf) { rapport.verifier.push(`${T.nom} · ${x.titre} : attendu « ${m.titre} » — ${m.artiste} | trouvé ${label}`); console.log('?', x.titre); }
        else { if (!vf) rapport.ok++; console.log(score === 2 ? '✓' : '?', x.titre, label && vf ? '→ ' + label : ''); }
        sauve();
      } catch (e) { rapport.introuvable.push(`${T.nom} · ${x.titre} : erreur ${e.message}`); console.log('✗', x.titre, e.message); }
    }
    sauve();
  }
  const out = [
    `OK : ${rapport.ok}   |   Versions françaises trouvées : ${rapport.vf}`,
    `\nVF — TITRE FRANÇAIS À CHOISIR : ${rapport.choisir.length}  (renvoie-moi ces lignes)`, ...rapport.choisir,
    `\nVF — PAS D'ALBUM FRANÇAIS TROUVÉ : ${rapport.sansAlbum.length}`, ...rapport.sansAlbum,
    `\nVF — ARTISTE À COMPLÉTER (album collectif) : ${rapport.artiste.length}`, ...rapport.artiste,
    `\nÀ VÉRIFIER (écoute le fichier, extrait téléchargé mais peut-être pas le bon morceau) : ${rapport.verifier.length}`, ...rapport.verifier,
    `\nINTROUVABLES (à faire à la main) : ${rapport.introuvable.length}`, ...rapport.introuvable,
    `\nINFOS À COMPLÉTER dans le JSON ([Ajouter ...]) : ${rapport.completer.length}`, ...rapport.completer,
  ].join('\n');
  fs.writeFileSync('audio_a_verifier.txt', out);
  console.log('\n' + out);
})();
