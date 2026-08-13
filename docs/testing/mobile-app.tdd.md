# Application mobile — preuve TDD

## Parcours couverts

- La requête météo accepte sept jours (`test/weather.test.js`).
- La semaine mobile garde les sept premiers jours et produit une recommandation complète pour chacun (`test/mobile.test.js`).
- Le widget reprend le lieu, la tenue, le ressenti et le premier risque utile, sans inventer d’alerte (`test/mobile.test.js`).
- Les libellés météo et les palettes restent lisibles, y compris sous un ciel sombre (`test/mobile-presentation.test.js`).

Les trois premiers scénarios mobiles ont été écrits et exécutés en échec avant l’implémentation, puis repassés au vert après l’ajout des adaptateurs mobile, widget et présentation.

## Exécution du 13 août 2026

| Vérification | Résultat |
| --- | --- |
| `npm test` à la racine | 208 tests réussis |
| Couverture Node | 97,56 % lignes, 93,95 % branches, 97,54 % fonctions |
| `npm run typecheck` dans `apps/mobile` | réussi |
| `npm run lint` dans `apps/mobile` | réussi |
| `npx expo export --platform web --output-dir dist-web` | réussi |
| `npx expo prebuild --no-install --platform android` | réussi ; receiver `TodayOutfit` généré |
| `npx expo prebuild --no-install --platform ios` | réussi ; extension et groupe d’apps générés |

## Vérification de parcours

Rendu vérifié dans un viewport mobile de 390 × 844 : affichage de la recommandation, rail horizontal de sept jours, changement du jour sélectionné, recherche de « Lyon » et rechargement des prévisions. Le rendu initial en attente de géolocalisation, ainsi que le cas avec ville enregistrée, ont aussi été contrôlés.

## Limites restantes

La configuration native est validée par Expo, mais le rendu final du widget doit encore être ouvert dans un build de développement sur un iPhone et un appareil Android. Les widgets ne s’exécutent pas dans Expo Go. L’intégration physique (ajout à l’écran d’accueil et actualisation planifiée) est donc le seul contrôle non automatisé à ce stade.
