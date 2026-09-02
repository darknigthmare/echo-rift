# ECHO RIFT — v1.1.0

ECHO RIFT est un blind test transformé en jeu vidéo de science-fiction. Il fonctionne entièrement dans un navigateur moderne, sans compte, sans connexion obligatoire et sans dépendance externe.

## Production officielle

La production ECHO RIFT autorisée est exclusivement **https://echo-rift-opal.vercel.app**. Le projet Vercel lié est `echo-rift` (`prj_K2o2J63NF0kbQHkZM3dILqHqcCAV`). Toute publication doit être contrôlée sur cet alias après déploiement.

## Lancer le jeu

### Windows — méthode recommandée

Double-cliquez sur `START_ECHO_RIFT.bat`. Le lanceur utilise Node.js s’il est installé, puis Python en solution de secours. Le jeu s’ouvre à l’adresse locale `http://localhost:8765/`.

### Version autonome

Double-cliquez sur `JOUER_ECHO_RIFT.html`. Cette version contient le jeu complet dans un seul fichier. Selon les restrictions du navigateur sur les fichiers locaux, l’import audio persistant peut nécessiter le lanceur Windows.

### Linux ou macOS

Lancez `./START_ECHO_RIFT.sh`, ou exécutez `node local-server.js` dans ce dossier.

## Contenu inclus

- 72 échos originaux générés en temps réel : 60 compositions et 12 bruitages.
- 11 familles sonores : arcade, horreur, science-fiction, fantasy, cyber, industriel, abysses, désert, onirique, mystère et bruits iconiques.
- Course solo avec score, rapidité, séries et progression.
- Party local de 2 à 4 joueurs avec clavier, manettes et sélection tactile par joueur.
- Faille infinie avec trois vies.
- Campagne Archive Run en cinq secteurs, étoiles et boss final.
- Cinq types de manches : classique, univers sonore, éclair, fracture et mémoire.
- Quatre Modules de Résonance : Analyse, Amplificateur, Bouclier et Boucle.
- Musée sonore d’entraînement avec recherche et filtres.
- Atelier permettant d’importer ses propres fichiers MP3, WAV, OGG, M4A et autres formats pris en charge par le navigateur.
- Sauvegarde locale des niveaux, scores, succès, découvertes, réglages et campagne.
- Onboarding audio au premier lancement et reprise versionnée d’une partie interrompue.
- États de victoire, défaite, secteur non stabilisé et erreur audio sans pénalité injuste.
- Support souris, tactile, clavier et manettes via la Gamepad API.
- Réglages de volume, contraste renforcé et réduction des mouvements.
- Application web installable et utilisable hors ligne lorsqu’elle est lancée par le serveur local.

## Commandes Party local

| Joueur | Réponse 1 | Réponse 2 | Réponse 3 | Réponse 4 |
|---|---:|---:|---:|---:|
| J1 | 1 | 2 | 3 | 4 |
| J2 | Q | W | E | R |
| J3 | A | S | D | F |
| J4 | Z | X | C | V |

En solo, les portails peuvent aussi être sélectionnés à la souris ou au toucher. En Party sur écran tactile, sélectionnez d’abord le joueur dans la barre dédiée, puis sa réponse ; les choix restent masqués jusqu’à la révélation. `Entrée` ou `Espace` passe à la question suivante après la révélation. `Échap` propose de quitter la partie.

## Bibliothèque personnelle

L’Atelier audio stocke les fichiers dans IndexedDB, directement dans le profil local du navigateur. Aucun fichier n’est envoyé à un serveur. Quatre pistes distinctes sont nécessaires pour générer une partie. Le titre et l’artiste peuvent être corrigés après l’import.

Le fichier d’export de l’Atelier contient uniquement les métadonnées ; les fichiers audio ne sont volontairement pas recopiés.

## Structure du projet

- `index.html` : coque de l’application.
- `styles.css` : interface responsive et effets visuels.
- `content.js` : catalogue original, catégories, campagne et succès.
- `audio-engine.js` : synthèse Web Audio, effets de fracture et visualiseur.
- `storage.js` : progression locale et bibliothèque IndexedDB.
- `game.js` : navigation, manches, scoring, modes, modules et progression.
- `local-server.js` : serveur local Node.js sans dépendance.
- `sw.js` et `manifest.webmanifest` : installation et fonctionnement hors ligne.
- `scripts/` : génération déterministe de la version autonome et contrôle du contenu livré.
- `tests/` : parcours automatisés Playwright sur serveur HTTP réel, desktop et mobile.
- `.vercelignore` : liste explicite des fichiers internes exclus de la production.

## Validation locale

```bash
npm ci
npx playwright install chromium
npm run qa
```

`npm run build` régénère `JOUER_ECHO_RIFT.html` depuis les sources avant de vérifier la version, les 72 échos, la PWA, l’URL de production et les exclusions Vercel. `npm test` exécute les parcours essentiels dans Chromium.

## Publication

```bash
npm run qa
npx vercel --prod --yes
npx vercel inspect https://echo-rift-opal.vercel.app
```

Ne pas utiliser un ancien dossier `.vercel/output` avec `--prebuilt` : ce projet est publié depuis la racine statique contrôlée. Vérifiez ensuite le statut `Ready`, l’alias officiel et la réponse HTTP 200.

## Droits et audio

Le code, les noms fictifs, les compositions procédurales et les bruitages inclus ont été créés pour ECHO RIFT. Aucun extrait musical commercial ou contenu sous licence tierce n’est fourni. Les fichiers importés par l’utilisateur restent sous sa responsabilité et ne sont pas redistribués par le jeu.
