# ToDo Smart

Capture ultra-rapide de tâches et d'idées, synchronisée entre appareils. Une page statique, sans build.
En ligne : https://haniwanice.github.io/todo-smart/

## Utiliser

- Tape n'importe où : le texte va dans le champ du haut. **Entrée** va à la ligne, **Maj+Entrée** (ou le bouton Ajouter) crée la tâche. La 1re ligne est le titre, la suite la description.
- La tâche va dans l'onglet ouvert (le premier onglet depuis Tout ou Favoris).
- Onglets en bas : **+ Nouvel onglet** crée et renomme. Double-clic ou clic sur le grand titre pour renommer, clic droit ou ⋯ pour la couleur et la suppression. Glisser un onglet pour le déplacer.
- Glisser une tâche (poignée à gauche) sur un onglet pour la déplacer, sur Favoris pour l'étoiler.
- Chaque tâche : cercle = terminée, cercle pointillé = en cours, étoile = favori, épingle = toujours en haut.
- Survoler une tâche montre sa description (3 lignes), cliquer l'ouvre en entier pour l'éditer.
- Mise en forme sans syntaxe : boutons B / I / liste / checklist, ou sélectionner du texte, ou **Ctrl+B**, **Ctrl+I**, **Ctrl+Maj+8** (liste), **Ctrl+Maj+9** (checklist).
- Filtres par onglet, combinables : Favoris, À faire, En cours, Terminés. Sans filtre : tout sauf les terminées.
- **Ctrl+F** recherche, **Alt+1…9** onglets, **Ctrl+Z** annule la dernière action, bouton lune/soleil pour le thème.
- Le lien de la page (`…/#<id>`) **est** l'espace : qui l'a peut lire et modifier.

## Développer

```sh
npm run dev    # http://127.0.0.1:5173  (ajouter ?local pour ignorer Firestore)
npm test       # logique pure (rendu, filtres, tri, migration)
```

Déployer = pousser sur `main` (GitHub Pages).

## Synchronisation

Firestore, projet Firebase `todo-1d5e9` (offre gratuite, europe-west9). Collections `spaces/<id>/items` et `spaces/<id>/tabs`.
Après toute modification de `firestore.rules`, la coller dans la console Firebase (Firestore → Règles → Publier).
La clé `apiKey` Firebase n'est pas un secret : la sécurité vient des règles.

## Architecture

| Fichier | Rôle |
|---|---|
| `src/model.js` | règles pures : filtres, tri (épinglées, puis récentes), découpage titre/description, migration v1 |
| `src/parse.js` | Markdown → HTML (inline et blocs), échappement |
| `src/editor.js` | édition riche contenteditable ↔ Markdown, mise en forme, checklists |
| `src/backends.js` | `localBackend` / `firestoreBackend`, même interface sur `items` et `tabs` |
| `src/app.js` | état, rendu par clés (n'écrase jamais un champ en cours d'édition), interactions |
| `src/icons.js` | jeu d'icônes SVG à trait unique |
