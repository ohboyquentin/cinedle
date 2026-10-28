// Télécharge un extrait officiel de 30 s (API iTunes Search, gratuite, sans clé) pour :
//   - films_animation.json  → champ "musique"   → assets/audio/musiques/<slug>.m4a
//   - series.json           → champ "generique" → assets/audio/generiques/<slug>.m4a
//   - animes.json           → champ "opening"   → assets/audio/openings/<slug>.m4a
// et met à jour "extrait_audio" dans le JSON (le reste du fichier n'est pas touché).
//
// Usage (dans le dossier qui contient les JSON) :   node itunes_audio.js
//   --force            refait aussi les extraits déjà téléchargés
//   --only=animation   (ou series, animes) pour ne traiter qu'un thème
// Écrit aussi audio_a_verifier.txt : morceaux douteux, introuvables, et infos à compléter. Node 18+ requis.
const fs = require('fs'), path = require('path');
const FORCE = process.argv.includes('--force');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);

const THEMES = [
  { nom: 'animation', fichier: 'films_animation.json', champ: 'musique',   dossier: 'assets/audio/musiques',   pays: ['fr', 'us'] },
  { nom: 'series',    fichier: 'series.json',          champ: 'generique', dossier: 'assets/audio/generiques', pays: ['us', 'fr'] },
  { nom: 'animes',    fichier: 'animes.json',          champ: 'opening',   dossier: 'assets/audio/openings',   pays: ['jp', 'us', 'fr'] },
];

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const manque = m => !m || /\[Ajouter/i.test((m.titre || '') + (m.artiste || ''));

async function get(url, binaire) {
  for (let essai = 0; essai < 4; essai++) {
    const r = await fetch(url);
    if (r.ok) return binaire ? Buffer.from(await r.arrayBuffer()) : r.json();
    if (r.status === 403 || r.status === 429 || r.status >= 500) { await sleep(8000 * (essai + 1)); continue; }  // limite de débit
    throw new Error('HTTP ' + r.status);
  }
  throw new Error('trop de refus (limite de débit iTunes)');
}

// Cherche le meilleur candidat. Retourne { url, score, label } ; score 2 = sûr, 1 = à vérifier, 0 = rien.
async function chercher(oeuvre, m, pays) {
  const titre = norm(m.titre), oeuvreN = norm(oeuvre);
  const artistes = m.artiste.split(/ et | & |, | feat\.? /i).map(norm).filter(a => a.length > 2);
  const requetes = [`${m.titre} ${m.artiste}`, `${m.titre} ${oeuvre}`, m.titre];
  let meilleur = { score: 0 };
  for (const p of pays) for (const q of requetes) {
    const u = 'https://itunes.apple.com/search?media=music&entity=song&limit=15&country=' + p + '&term=' + encodeURIComponent(q);
    let res; try { res = (await get(u)).results || []; } catch (e) { res = []; }
    await sleep(3200);                                   // ~19 requêtes/min max côté iTunes
    for (const c of res) {
      if (!c.previewUrl) continue;
      const nom = norm(c.trackName), art = norm(c.artistName), alb = norm(c.collectionName);
      const okTitre = nom === titre || nom.includes(titre) || (nom.length > 3 && titre.includes(nom));
      if (!okTitre) continue;
      const okArt = artistes.some(a => art.includes(a) || a.includes(art));
      const okAlb = oeuvreN.length > 2 && (alb.includes(oeuvreN) || nom.includes(oeuvreN));
      const score = (okArt || okAlb) ? 2 : 1;
      if (score > meilleur.score) meilleur = { score, url: c.previewUrl, label: `${c.trackName} — ${c.artistName} (${c.collectionName})` };
    }
    if (meilleur.score === 2) return meilleur;
  }
  return meilleur;
}

(async () => {
  const rapport = { verifier: [], introuvable: [], completer: [], ok: 0 };
  for (const T of THEMES) {
    if (ONLY && ONLY !== T.nom) continue;
    let texte = fs.readFileSync(T.fichier, 'utf8');
    const data = JSON.parse(texte);
    fs.mkdirSync(T.dossier, { recursive: true });
    console.log(`\n== ${T.nom} (${data.length}) ==`);
    for (const x of data) {
      const m = x[T.champ];
      if (manque(m)) { rapport.completer.push(`${T.nom} · ${x.titre} : ${m ? m.titre + ' / ' + m.artiste : 'champ absent'}`); continue; }
      const fichier = `${T.dossier}/${slug(x.titre)}.m4a`;
      if (!FORCE && fs.existsSync(fichier)) { rapport.ok++; continue; }
      try {
        const c = await chercher(x.titre, m, T.pays);
        if (!c.score) { rapport.introuvable.push(`${T.nom} · ${x.titre} : « ${m.titre} » — ${m.artiste}`); console.log('✗', x.titre); continue; }
        fs.writeFileSync(fichier, await get(c.url, true));
        if (m.extrait_audio && m.extrait_audio !== fichier)
          texte = texte.split(JSON.stringify(m.extrait_audio).slice(1, -1)).join(fichier);   // remplace le chemin tel quel dans le fichier
        if (c.score === 1) { rapport.verifier.push(`${T.nom} · ${x.titre} : attendu « ${m.titre} » — ${m.artiste} | trouvé ${c.label}`); console.log('?', x.titre); }
        else { rapport.ok++; console.log('✓', x.titre); }
        fs.writeFileSync(T.fichier, texte);
      } catch (e) { rapport.introuvable.push(`${T.nom} · ${x.titre} : erreur ${e.message}`); console.log('✗', x.titre, e.message); }
    }
  }
  const out = [
    `OK : ${rapport.ok}`,
    `\nÀ VÉRIFIER (écoute le fichier, extrait téléchargé mais peut-être pas le bon morceau) : ${rapport.verifier.length}`, ...rapport.verifier,
    `\nINTROUVABLES (à faire à la main) : ${rapport.introuvable.length}`, ...rapport.introuvable,
    `\nINFOS À COMPLÉTER dans le JSON ([Ajouter ...]) : ${rapport.completer.length}`, ...rapport.completer,
  ].join('\n');
  fs.writeFileSync('audio_a_verifier.txt', out);
  console.log('\n' + out);
})();
