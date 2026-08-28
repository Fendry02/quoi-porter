# Design — L'assistant valise

Date : 2026-08-28
Statut : validé

## Objectif

« Je pars du 8 au 13 septembre à Lisbonne puis à Porto — dis-moi quoi emporter. »

L'app répond aujourd'hui à une question posée depuis chez soi, pour aujourd'hui. Celle-ci
est la même question déplacée dans le temps et dans l'espace : elle ne demande pas une
tenue mais **la réunion de N tenues**, et elle se lit non pas quatre secondes avant de
sortir mais la veille au soir, sac ouvert sur le lit.

Le design « tenue du jour » avait posé les fondations exprès : `buildOutfit()` est une
fonction pure d'une journée. L'appliquer à N journées est direct ; tout le travail est dans
l'agrégation et dans l'affichage.

## Périmètre

Dans le périmètre :

- Un voyage : une tranche de dates continue, une ou plusieurs villes
- La liste de ce qu'on emporte, avec des quantités et la raison de chaque ligne
- Le déroulé jour par jour du séjour, avec son ciel
- Les coches : ce qui est déjà dans le sac
- Une bibliothèque de voyages, gardée sur l'appareil
- Le tout dans l'app mobile

Hors périmètre :

- **Les normales saisonnières.** Au-delà du seizième jour, l'app dit qu'il est trop tôt.
  Moyenner les années passées donnerait une réponse tout de suite, mais une réponse qui
  n'est pas une prévision — et le produit s'est construit sur le fait de savoir quand ne
  pas se croire. Reste possible en v2, avec un langage à part.
- **Les essentiels non vestimentaires** : chargeur, brosse à dents, adaptateur. Ils ne se
  déduisent d'aucune prévision, et ouvrent une liste sans fin à maintenir. Le moteur s'est
  déjà interdit la gourde — « boire n'est pas un vêtement ».
- **Une coche par unité.** Voir les décisions.
- **Le widget.** Il continue de répondre pour aujourd'hui, chez soi. Une valise ne se lit
  pas d'un regard.
- **L'écran web.** Le module d'agrégation reste pur et framework-libre, donc la page
  pourra s'en servir ; son interface n'est pas dessinée ici.
- Le poids, le format cabine, le nombre de bagages.

## Décisions de conception

### Un voyage est une tranche de temps continue

Pas un sac d'étapes indépendantes ayant chacune deux dates. Un voyage a un départ, un
retour, et des villes qui se succèdent :

```js
{ start, end, stops: [{ place, from }] }
```

Une étape court de son `from` jusqu'au `from` de la suivante, ou jusqu'à `end`. La première
commence forcément au départ.

Ce choix rend **les états absurdes inexprimables** : ni trou entre deux villes, ni
chevauchement, ni étape hors du séjour. Il n'y a donc aucune validation à écrire, aucun
message d'erreur à formuler, et aucun test à tenir pour des situations qui n'existent pas.
Le prix payé : on ne peut pas décrire un séjour à trous — « trois jours à Lisbonne, retour
chez soi, deux jours à Porto ». Ce sont deux voyages, et la bibliothèque en tient deux.

### La quantité vient des jours qui réclament la pièce

Pas de la durée du séjour. Cinq jours à Lisbonne dont deux frais donnent **un** pull, pas
cinq. C'est la seule règle qui distingue une valise d'une multiplication.

### Un seul plafond, et il se dit à voix haute

Quatorze jours ne donnent pas quatorze t-shirts : on lave. Les pièces portées à même la
peau sont donc plafonnées à sept, **et la ligne dit pourquoi** — « 7 t-shirts, au-delà tu
laveras ». L'hypothèse est assumée dans le texte plutôt que cachée dans un `Math.min`.

### La coche tient à la racine du vêtement

`garmentRoot()` existe déjà pour savoir que « pull fin » et « pull épais » sont le même
pull. C'est aussi ce qui fait survivre une coche au rafraîchissement de la prévision : la
veille du départ, la météo se précise, le pull fin devient un pull épais, et la coche reste
— c'est toujours le même crochet du placard. Une clé sur le nom complet aurait décoché le
sac tout seul, sans que personne comprenne pourquoi.

Conséquence retenue : quand une racine donne deux poids (voir plus bas), **les deux poids
sont une seule ligne**, avec une seule coche. Un crochet, une coche.

Une exception, qui suit le même raisonnement jusqu'au bout : la couche extérieure est unique
toutes racines confondues, donc sa clé n'est pas une racine mais **`couche`**. Sinon la
prévision qui se précise ferait passer d'`imperméable` à `manteau`, la clé changerait, et la
coche tomberait — exactement ce que la racine était censée empêcher. Un seul crochet pour la
couche, quelle que soit la pièce qui y pend.

### Une coche par ligne, pas par unité

« 7 t-shirts » se coche une fois. Sept gestes pour une ligne feraient de l'app un
gestionnaire de tâches ; la quantité est une information, pas une liste de sous-tâches.

### Rien ne se supprime tout seul

Un voyage terminé reste dans la bibliothèque, en grisé. « Le même séjour l'an prochain »
est un vrai usage, et un élagage automatique se remarque toujours trop tard.

## Architecture

```
quoi-porter/
├── js/
│   ├── weather.js     Open-Meteo → DayWeather   (+ modelCount, seul ajout)
│   ├── rules.js       PUR : DayWeather → Outfit           inchangé
│   ├── packing.js     PUR : Trip + prévisions → Packing   NOUVEAU
│   ├── phrasing.js    PUR : + describePacking()           étendu
│   └── …
├── test/
│   └── packing.test.js                                    NOUVEAU
└── apps/mobile/src/
    ├── app/packing.tsx        l'écran valise               NOUVEAU
    ├── core/packing.ts        ré-export du moteur racine   NOUVEAU
    ├── hooks/use-trip.ts      voyages, prévisions, coches  NOUVEAU
    ├── packing/               composants de l'écran        NOUVEAU
    └── lib/storage.*          une clé de plus
```

Les frontières du projet sont conservées : `rules` décide, `packing` agrège, `phrasing`
parle. `packing.js` ne produit aucune phrase et ne touche ni au réseau ni au DOM ; il est
testé sous Node comme les autres modules purs.

Un déplacement, pour ne pas dupliquer une vérité : `dayLabel()` — le libellé calendaire
d'une journée — est aujourd'hui une fonction locale de `mobile.js`. Elle **remonte dans
`hours.js`**, où vit déjà `placeDate()`, et `mobile.js` l'y importe. Sans ça, `packing.js`
soit recopierait le format des dates, soit dépendrait du module de contrat mobile, ce qui
est l'inverse du sens des dépendances.

### Contrat — Trip

Écrit par l'app, lu par `packing.js`. Mémorisé sous `quoi-porter.trips`, un tableau.

```js
{
  id: 'trip-1787910810',              // stable, jamais réutilisé ; les coches y tiennent
  start: '2026-09-08',                // ISO, jour local du premier lieu
  end: '2026-09-13',
  stops: [
    { place: { name: 'Lisbonne, …', latitude: 38.72, longitude: -9.14 }, from: '2026-09-08' },
    { place: { name: 'Porto, …',    latitude: 41.15, longitude: -8.61 }, from: '2026-09-11' },
  ],
  packed: ['t-shirt', 'pull', 'parapluie'],   // des racines, jamais des noms complets
}
```

Invariants — `stops` non vide, trié par `from`, `stops[0].from === start`, tout `from` dans
`[start, end]`. Garantis par construction dans l'interface. Vérifiés une fois de plus **à
la lecture du disque** : un voyage écrit par une version antérieure, ou un fichier de
préférences abîmé, est écarté en silence plutôt que de faire planter l'écran.

L'`id` est fabriqué par l'app au moment de créer le voyage. `packing.js` reste pur : il ne
tire ni horloge ni hasard.

### Contrat — Packing

Produit par `packing.js`, consommé par `phrasing.js` et par l'écran.

```js
{
  trip,                               // le voyage tel quel : phrasing y lit les villes
  days: TripDay[],
  wear: [
    {
      key: 'pull',                    // la racine : c'est la clé de coche
      count: 2,
      pieces: [                       // les poids, du plus couvrant au moins
        { name: 'pull épais', count: 1 },
        { name: 'pull fin',   count: 1 },
      ],
      days: ['2026-09-11', '2026-09-12'],   // les jours qui la réclament
      capped: false,                  // vrai quand le plafond a mordu
    },
  ],
  carry: [{ key: 'parapluie', days: [...] }],   // un exemplaire, et la clé est le nom :
                                                // un accessoire n'a pas de poids

  notes: [{ kind: 'rain', label: 'Pluie', text: '…', days: [...] }],
  horizon: {
    covered: ['2026-09-08', …],       // jours du séjour que la prévision atteint
    missing: ['2026-09-14'],          // jours hors fenêtre : comptés, jamais inventés
  },
}
```

`TripDay` a la forme d'une journée de l'accueil, plus son lieu :

```js
{ id: '2026-09-09', label: 'mer. 9 sept.', place, weather, outfit, phrasing }
```

`phrasing` vient de `describeDay()` tel quel. `versusYesterday` et `later` en sont absents :
« 3 °C de moins qu'hier » et « prends une veste pour ce soir » sont des notions
d'aujourd'hui-chez-soi, et ne veulent rien dire sous une date de séjour.

Le nombre de centres de prévision qui répondent n'est pas recopié dans `horizon` : il vit
dans `days[].weather.modelCount`, et `describePacking()` va l'y lire. Une vérité, un
endroit.

### Contrat — la mise en mots

Produit par `describePacking(packing)` dans `phrasing.js`, consommé par l'écran. Aucune
date ISO n'en sort : l'écran n'a plus à formater quoi que ce soit.

```js
{
  title: 'Lisbonne → Porto',
  dates: '8 → 13 sept.',
  wear: [
    {
      key: 'pull',
      label: '2 pulls',              // ou « 1 pull épais » quand il n'y a qu'un poids
      detail: 'un épais, un fin',    // null quand un seul poids
      why: 'mer. 11 et jeu. 12, sous 5 °C',
    },
  ],
  carry: [{ key: 'parapluie', label: 'un parapluie', why: 'mar. 9, à Porto' }],
  notes: [{ label: 'Pluie', text: 'Il va bien pleuvoir.', when: 'mar. 9 et jeu. 11' }],
  confidence: 'À partir du 5 septembre, deux centres de prévision sur cinq répondent encore — la liste peut bouger.',
  horizon: 'Les 2 derniers jours sont trop loin : reviens le 30 août.',
}
```

`confidence` et `horizon` valent `null` quand il n'y a rien à dire — l'app ne remplit pas
une ligne pour l'occuper.

## Le moteur d'agrégation

`buildTrip(trip, forecasts, profile, at)` — `forecasts` est un tableau parallèle à
`trip.stops`, chaque entrée étant ce que `fetchForecast` a rendu pour cette ville.

1. **Découper.** Chaque étape donne ses jours, de son `from` (inclus) au `from` suivant
   (exclu) ou à `end` (inclus). Les jours déjà passés tombent : un séjour commencé ne parle
   que des jours qui restent. « Passé » se juge sur la date locale **du lieu de l'étape**,
   via `placeDate(at, utcOffsetSeconds)` — comme `todayIndex()` le fait déjà sur l'accueil.
   Un séjour à Tokyo n'a pas la même date d'aujourd'hui qu'un téléphone à Paris. Les jours
   qu'aucune prévision n'atteint vont dans `horizon.missing`.
2. **Habiller.** `buildOutfit(weather, profile)` par jour, puis `describeDay()`. L'union ne
   s'est jamais souciée d'où venait la journée : le multi-étapes ne coûte rien ici.
3. **Regrouper par racine.** `garmentRoot()` sur chaque pièce de `layers.top`,
   `layers.bottom`, `layers.outer`. Les accessoires vont dans `carry`, un exemplaire chacun.
4. **Compter.** Voir le barème.
5. **Nommer les poids.** Voir le cas des deux poids.
6. **Grouper les risques.** Voir plus bas.

### Barème de renouvellement

Pour chaque racine : `count = ceil(jours qui la réclament / période)`.

| Classe | Racines | Période | Plafond |
|---|---|---|---|
| Peau | `t-shirt`, `sous-couche` | 1 jour | **7** |
| Relais | `chemise`, `pull` | 3 jours | — |
| Bas | `short`, `pantalon`, `jean` | 4 jours | — |
| Couche | `veste`, `coupe-vent`, `imperméable`, `manteau` | — | **1 en tout** |
| À emporter | `parapluie`, `écharpe`, `gants`, `bonnet`, `casquette`, `lunettes` | — | 1 chacun |

Une racine inconnue du barème — un palier ajouté plus tard, un mot changé — tombe dans la
classe Relais. C'est le comportement le moins faux par défaut : une pièce de trop vaut
mieux qu'une pièce oubliée, et une pièce par trois jours vaut mieux qu'une par jour.

**La couche extérieure est unique**, toutes racines confondues : on n'emporte pas à la fois
un coupe-vent, un imperméable et un manteau. On garde la plus couvrante, dans cet ordre —
`manteau`, `imperméable`, `coupe-vent`, `veste`. Le cas qui inquiète, un séjour avec un jour
de pluie à 20 °C et un jour sec à 3 °C, est déjà couvert : le modificateur `rain` a posé un
parapluie sur le jour humide, et `rules.js` sait déjà que par grand froid on garde le
manteau plutôt que l'imperméable.

### Le cas des deux poids

Un séjour réclame un pull fin trois jours et un pull épais deux jours. « Le plus épais
l'emporte » donnerait *deux pulls épais*, ce qui est bête. Règle retenue, en une phrase :

> La quantité se calcule sur la racine ; les poids sont ensuite nommés du plus couvrant au
> moins couvrant, un par exemplaire, et les exemplaires en trop répètent le plus couvrant.

- 1 exemplaire, deux poids demandés → `1 pull épais`. Le plus épais couvre le jour qui
  voulait un pull fin ; l'inverse est faux.
- 2 exemplaires, deux poids → `1 pull épais` + `1 pull fin`. Un séjour à grand écart reçoit
  naturellement ses deux poids, sans seuil réglé à l'œil.
- 3 exemplaires, deux poids → `2 pulls épais` + `1 pull fin`.

Une seule ligne dans tous les cas, une seule coche : c'est le même crochet du placard.

**« Plus couvrant » ne se lit pas dans une table**, sauf pour la couche extérieure dont les
quatre valeurs sont fixées plus haut. Pour le haut et le bas, il se déduit des données : le
poids demandé par la journée la plus froide — le plus petit `dressedFor` — est le plus
couvrant. Une table de noms complets aurait dû lister « pull épais », « chemise légère »,
« pantalon léger ou jupe » et tout ce qu'un futur palier ajoutera ; elle aurait pourri en
silence au premier mot changé dans `rules.js`.

### Les risques, groupés

Cinq notes de pluie pour cinq jours de pluie sont illisibles. Les notes de `describeDay()`
sont donc regroupées par `kind` : les jours s'accumulent dans `days`, et le texte retenu est
celui du jour **le plus sévère** — on fait sa valise pour le pire jour, pas pour le médian.

Les heures disparaissent du groupement. « Vers 14 h » a un sens le matin même ; sur une
liste faite trois jours plus tôt, c'est la date qui compte.

## L'honnêteté de l'horizon

`normalizeForecast()` gagne un champ par jour : `modelCount`, le nombre de centres de
prévision qui ont publié une valeur d'`apparent_temperature_max` — la grandeur sur laquelle
tout le moteur décide. Dans le repli mono-requête, où les champs n'ont pas de suffixe, il
vaut 1 dès qu'une valeur existe.

C'est le seul ajout au moteur existant, et voici pourquoi il est nécessaire. Au-delà du
septième jour, Météo-France et l'ICON ont cessé de publier ; il ne reste qu'ECMWF et GFS,
puis GFS seul au seizième jour. Or **l'écart entre deux modèles ressemble à l'écart entre
cinq, en plus petit**. Sans ce compte, l'app afficherait sa plus grande assurance
exactement là où elle en a le moins — soit le contraire de ce que le produit promet.

`describePacking()` en tire une phrase, et une seule : « À partir du 5 septembre, deux
centres de prévision sur cinq répondent encore — la liste peut bouger. » La confiance jour
par jour, elle, continue de venir de `outfitIsRobust()` via `describeDay()`, et s'affiche
dans le panneau du jour choisi. Deux échelles, deux endroits, aucune redite.

## Les coches

Deux fonctions pures de plus dans `packing.js`, hors de `buildTrip` pour que le calcul de
valise ne sache rien de l'état du sac :

- `applyPacked(packing, packed)` → le même `Packing`, chaque ligne portant `packed: bool`,
  plus `progress: { done, total }`.
- `prunePacked(packing, packed)` → les clés encore utiles. Appelée à l'écriture : une coche
  devenue sans objet s'élague au lieu de dormir sur le disque.

## Interface

### L'écran valise

`apps/mobile/src/app/packing.tsx`, dans le `Stack` déjà en place. De haut en bas :

1. **« Lisbonne → Porto · 8 → 13 sept. »** — les villes et les dates dans une seule phrase,
   comme « Paris · Aujourd'hui » sur l'accueil.
2. **« 4 sur 7 dans le sac »** — une ligne calme au-dessus de la liste.
3. **La valise, en grand.** Une ligne par racine : la quantité en chiffres tabulaires, le
   nom en serif — le serif est réservé au conseil dans cette app —, les poids en détail
   quand il y en a deux, et la raison en muet dessous. Toucher la ligne la coche : elle se
   barre et s'estompe. C'est la promesse de l'écran, donc c'est la plus grande chose.
4. **Ce qu'on emporte**, séparé de ce qu'on porte, comme sur l'accueil.
5. **Le ruban des jours du séjour** — `DayRail` tel quel : il boucle sur `days` sans jamais
   supposer sept. Il gagne **un trait fin à la frontière d'étape** : sans lui, le jour où
   l'on change de ville ressemble à tous les autres.
6. **Le panneau du jour choisi** : sa ville, sa tenue, sa phrase météo, sa confiance.
   Toucher un jour ne remplace jamais la valise — la liste est la réponse, les jours sont sa
   légende.
7. **Les risques groupés**, puis la ligne d'horizon.

Le ciel suit le jour choisi, à l'heure et au lieu de ce jour-là — `sky.js` calcule déjà la
hauteur du soleil avec le décalage du lieu. On fait glisser le pouce, et on voit le ciel de
Porto arriver au milieu du séjour.

### Le choix des dates est l'horizon

Pas de calendrier qui laisse viser dans trois semaines pour s'excuser ensuite. Une grille
des seize jours qui existent — sept colonnes, trois rangées — sur laquelle un séjour se voit
comme un bloc contigu : on touche l'arrivée, puis le départ. Dessous, la phrase qui dit le
reste : « Au-delà du 12 septembre, la météo n'existe pas encore. »

Aucune dépendance nouvelle : seize pastilles dans une grille sont moins de code qu'un
sélecteur de dates importé, et elles enseignent la limite au lieu de l'expliquer.

### Les étapes

« Ajouter une étape » demande une ville — la recherche de lieu existe déjà — et le jour où
l'on bouge, sur la même grille bornée au séjour. Retirer une étape rend ses jours à la
précédente. Aucun état invalide n'est atteignable.

### L'entrée depuis l'accueil

Une ligne discrète sous le ruban des sept jours : « Tu pars quelque part ? Prévoir ta
valise. » C'est là que l'attention est déjà tournée vers les jours à venir. L'accueil ne
perd rien d'autre : sa promesse reste une tenue en quatre secondes.

### La bibliothèque

Une feuille « Mes voyages » — le motif déjà employé pour la ville et le vestiaire, plutôt
qu'une route de plus. Les voyages à venir, puis une section « Passés » en grisé, puis
« Nouveau voyage ». L'écran ouvre le premier voyage dont la fin n'est pas passée ; si la
bibliothèque est vide, il ouvre le choix.

## Données

Une requête par étape, chacune jusqu'à la fin de son étape :

```
https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &daily=…&hourly=…
  &forecast_days={min(16, jours de aujourd'hui à la fin de l'étape)}
  &timezone=auto
  &models=ecmwf_ifs025,gfs_seamless,meteofrance_seamless,icon_seamless,ukmo_seamless
```

`forecast_days` compte depuis aujourd'hui : on demande donc de aujourd'hui à la fin de
l'étape, puis on découpe. Quelques journées de trop dans la réponse ne coûtent rien — le
service est gratuit et sans clé — et cela évite une arithmétique de fenêtre en double.

Aucun `past_days` : un séjour ne se compare pas à la veille.

Rafraîchissement au retour sur l'écran et par traction, comme l'accueil. Pas de minuterie :
une valise ne se relit pas toutes les dix minutes.

## Gestion des erreurs

| Situation | Comportement |
|---|---|
| Une étape sur trois échoue | La valise se construit sur les étapes obtenues ; les jours perdus vont dans `horizon.missing` et la ligne le dit. Pas d'écran d'erreur pour une ville sur trois. |
| Toutes les requêtes échouent | Message franc et bouton Réessayer, comme l'accueil. |
| Ensemble multi-modèles indisponible | `fetchForecast` retombe déjà sur une requête simple. La liste se construit, `modelCount` vaut 1, et la ligne de confiance le dit — plutôt que d'inventer un désaccord. |
| Séjour au-delà du seizième jour | Habille ce qu'il voit, compte le reste dans `missing`, n'invente aucune journée. |
| Séjour commencé | Les jours passés tombent : la valise ne parle que des jours qui restent. |
| Séjour terminé | L'écran ouvre le voyage suivant, ou le choix si la bibliothèque est vide. Le voyage fini reste, en grisé. |
| Voyage illisible sur le disque | Écarté en silence. Un voyage écrit par une version antérieure ne doit pas empêcher l'écran d'ouvrir. |
| Coche sans objet | Élaguée à l'écriture. |

## Tests

`node --test test/`, sans dépendance, comme les 303 tests existants. Écrits en échec avant
l'implémentation.

`packing.test.js` :

- cinq jours dont deux frais → **un seul pull**, et ses `days` nomment les deux jours
- t-shirts = nombre de jours qui les réclament, **plafonné à 7**, `capped` levé
- pull fin et pull épais fondus en **une ligne** : un exemplaire → le plus épais seul ; deux
  exemplaires → les deux poids ; trois → deux épais et un fin
- `short` et `jean` coexistent : racines différentes, deux lignes
- **jamais deux couches extérieures** : manteau retenu contre imperméable et coupe-vent
- un seul parapluie pour trois jours de pluie
- une racine hors barème tombe dans la classe Relais
- deux étapes → une seule liste, et les `days` d'une ligne pointent le bon lieu
- une étape ajoutée au milieu coupe la précédente ; retirée, ses jours reviennent
- séjour dépassant la fenêtre → `horizon.missing` compté, **aucun jour inventé**
- séjour commencé → les jours passés absents
- vestiaire `femme` → « short ou jupe » traverse l'agrégation
- `applyPacked` : une coche survit au passage de « pull fin » à « pull épais » ;
  `prunePacked` élague une clé disparue ; `progress` compte juste
- un voyage lu du disque sans `stops`, ou dont le premier `from` ne vaut pas `start`, est
  écarté

`weather.test.js` — `modelCount` : cinq modèles au premier jour, deux au douzième, 1 dans le
repli mono-requête, et le champ toujours présent.

`phrasing.test.js` — `describePacking` : le plafond dit pourquoi ; les deux poids se lisent
en une ligne ; la ligne d'horizon apparaît dès qu'un jour couvert tombe sous trois modèles,
et se tait sinon.

`mobile.test.js` — inchangé et toujours vert après le déplacement de `dayLabel` : c'est ce
qui prouve que le déplacement n'a rien changé aux libellés de l'accueil.

Puis `docs/testing/` mis à jour, avec les commandes réellement passées.

## Étapes d'implémentation

Le spec est unique — l'`id` du voyage est ce qui tient ensemble les étapes, les coches et la
bibliothèque, et les séparer créerait des raccords artificiels. Le plan, lui, se livre en
quatre temps, chacun vérifiable seul :

- **A.** `modelCount`, `packing.js`, `describePacking()`, les tests. Aucun écran. Le moteur
  multi-étapes est démontrable sous Node.
- **B.** L'écran valise, la grille de seize jours, les étapes, l'entrée depuis l'accueil.
  Un seul voyage, non mémorisé.
- **C.** Les coches et leur persistance.
- **D.** La bibliothèque de voyages.
