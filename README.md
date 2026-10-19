# ToDo Smart

Capture ultra-rapide de tâches et d'idées. Une page statique, sans build, synchronisée par Firestore.

## Utiliser

- Tape n'importe où → le texte va dans le champ. **Entrée** ajoute.
- `#onglet` dans le texte → rangé dans cet onglet (créé si besoin).
- Sans tag : l'onglet ouvert, sinon un classement **appris sur tes propres tâches** (✦), sinon Inbox. La destination s'affiche avant de valider ; clic sur l'onglet d'une tâche pour corriger, l'app apprend.
- **Maj+Entrée** : la suite devient la description. Markdown : `**gras**`, `*italique*`, `` `code` ``, `- puce`, `[ ] checklist` (cochable), liens.
- Cocher = archivé (date et heure exactes). **Ctrl+Z** annule. Archives → Restaurer / Supprimer.
- **Ctrl+F** recherche, **Alt+1…9** onglets, **Échap** vide le champ.
- Le lien de la page (`…/#<id>`) **est** l'espace : qui l'a peut lire et modifier.

## Développer

```sh
npm run dev    # http://127.0.0.1:5173
npm test       # logique (parsing, markdown, classement)
```

Sans configuration Firebase, l'app tourne en local (ce navigateur seulement, onglets synchronisés entre eux).

## Activer la synchronisation (gratuit, ~5 min)

1. https://console.firebase.google.com → **Ajouter un projet** (Analytics inutile).
2. **Build → Firestore Database → Créer** (mode production, région `europe-west`).
3. Onglet **Règles** : coller le contenu de `firestore.rules`, **Publier**.
4. **Paramètres du projet → Vos applications → Web (`</>`)** : enregistrer l'app, copier l'objet `firebaseConfig`.
5. Le coller dans `src/config.js` : `export const firebaseConfig = { apiKey: "...", ... };`

La clé `apiKey` Firebase n'est pas un secret : elle identifie le projet, la sécurité vient des règles.
Les tâches créées en mode local sont envoyées une fois en ligne au premier lancement synchronisé.

## Héberger sur GitHub Pages

Pousser le dossier sur un dépôt GitHub, puis **Settings → Pages → Deploy from branch → `main` / root**.
Dans Firebase, **Authentication → Paramètres → Domaines autorisés** n'est pas requis (pas d'auth).

## Architecture

| Fichier | Rôle |
|---|---|
| `src/parse.js` | capture (`#tag`, titre/description), rendu Markdown, échappement HTML |
| `src/classify.js` | Bayes naïf local avec classe « aucun » : il s'abstient plutôt que de mal ranger |
| `src/backends.js` | `localBackend` / `firestoreBackend`, même interface (`start`, `put`, `del`) |
| `src/app.js` | état, rendu par clés (n'écrase jamais un champ en cours d'édition), raccourcis |
