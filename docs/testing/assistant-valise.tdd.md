# Assistant valise — preuve de validation

## Parcours couverts

- Le séjour est découpé jour par jour, ville par ville ; les jours passés ne sont pas
  repris dans la valise (`test/packing.test.js`).
- Les quantités viennent des jours qui réclament chaque pièce, avec le plafond de sept sur
  les pièces de peau (`test/packing.test.js`).
- Deux poids d'une même racine restent sur une ligne ; les coches survivent aux variations
  de prévision et sont élaguées quand elles n'ont plus d'objet (`test/packing.test.js`).
- Chaque journée dit combien de modèles répondent encore, et la mise en mots expose la
  réserve associée (`test/weather.test.js`, `test/phrasing.test.js`).
- Depuis l'app mobile, la personne peut créer un séjour, chercher sa ville, ajouter une
  étape, cocher une ligne et retrouver son voyage après redémarrage.

## Exécution du 31 août 2026

| Vérification | Résultat |
| --- | --- |
| `npm test` à la racine | 368 tests réussis, 0 échec |
| `npm run typecheck` dans `apps/mobile` | réussi |
| `npm run lint` dans `apps/mobile` | réussi |
| Build local iOS Expo | réussi, 0 erreur, 1 avertissement Xcode existant (`-lc++` dupliquée) |

## Vérification sur simulateur

Sur iPhone 17 Pro (iOS Simulator), j'ai vérifié :

- le lien de l'accueil ouvre l'éditeur ;
- la grille borne le séjour à seize jours ;
- une recherche de Lisbonne crée et affiche une valise ;
- une ligne cochée devient « dans le sac », puis reste cochée après redémarrage ;
- une étape Porto ajoutée au 10 septembre met à jour le titre en « Lisbonne → Porto » ;
- la feuille « Mes voyages » liste le séjour enregistré.

## Limites restantes

Le projet ne fournit pas de banc de test pour les composants Expo. Les garanties métier sont
couvertes par les tests Node ; l'interface est couverte ici par TypeScript, ESLint et la
vérification sur simulateur. Le seul avertissement Metro observé concerne une API Skia
dépréciée, préexistante et hors du parcours valise.
