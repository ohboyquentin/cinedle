# CINÉDLE

Jeu défi quotidien façon Wordle / Loldle, sur le thème du cinéma, des séries et des animés.

## Le principe

Chaque jour, un film, une série ou un animé différent est tiré au sort (déterministe selon la date), et décliné en 6 mini-défis par thème :

| Thème | Défi 1 | Défi 2 | Défi 3 | Défi 4 | Défi 5 | Défi 6 |
|---|---|---|---|---|---|---|
| **Cinéma** | Film (grille) | Personnage (grille) | Affiche | Réplique + indice vocal | Musique | 3 images |
| **Séries** | Série (grille) | Personnage (grille) | Lieu culte | Titre d'épisode | Générique | 3 images |
| **Animés** | Animé (grille) | Personnage (grille) | Couverture manga | Réplique culte | Opening | 3 images |

Un mode **"All In"** permet d'enchaîner les 6 défis d'un thème à la suite.

## Structure des fichiers

```
index.html                    → l'application (tout le code, aucune dépendance externe)
films.json                    → base de films (Cinéma, défis 1/3/4/5/6)
personnages.json              → base de personnages de films (Cinéma, défi 2)
series.json                   → base de séries (Séries, défis 1/3/4/5/6)
personnages_series.json       → base de personnages de séries (Séries, défi 2)
animes.json                   → base d'animés (Animés, défis 1/3/4/5/6)
personnages_animes.json       → base de personnages d'animés (Animés, défi 2)
assets/                       → à créer : affiches, images, extraits audio (voir plus bas)
```

L'application charge les 6 fichiers JSON via `fetch()` au démarrage. **Tous les fichiers doivent être au même niveau** (à la racine du repo) pour que ça fonctionne.

⚠️ En local, ouvrir `index.html` directement depuis l'explorateur de fichiers (`file://...`) ne fonctionne pas à cause des restrictions de sécurité des navigateurs sur `fetch()`. Il faut soit tester via un serveur local (ex. extension "Live Server" de VS Code, ou `python -m http.server`), soit tester directement une fois déployé sur GitHub Pages (`https://...`, aucun souci).

## Étoffer le contenu

Pour ajouter des films, séries, animés ou personnages : éditer le fichier JSON concerné en ajoutant une entrée qui respecte la même structure que les entrées existantes. Aucune modification du code n'est nécessaire — l'app relit les fichiers à chaque chargement.

## Assets manquants

Les champs `affiche`, `lieu_culte`, `couverture_manga`, `images_defi6`, `audio_replique` et les `extrait_audio` (musique/générique/opening) pointent vers des chemins (`assets/...`) qui n'existent pas encore. Il faudra :
- ajouter les fichiers correspondants dans un dossier `assets/` organisé par type (`assets/affiches/`, `assets/images/`, `assets/audio/...`)
- ou adapter les chemins dans les JSON si une autre organisation est préférée

Attention aux droits d'auteur si le jeu est rendu public : affiches, musiques et extraits audio de films/séries/animés sont protégés.

## Déploiement

Déployé sur GitHub Pages. Après un push, l'app est accessible via l'URL générée dans Settings → Pages du repo.
