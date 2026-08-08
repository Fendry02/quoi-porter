# Design — « Qu'est-ce que je mets aujourd'hui ? »

Date : 2026-08-07
Statut : validé

## Objectif

Une page web qui répond à une question : que faut-il porter aujourd'hui, et demain ?
On l'ouvre le matin, on lit une phrase, on s'habille.

L'assistant valise (« je pars 3 jours là-bas, dis-moi quoi emporter ») fera l'objet d'un
design séparé. Ce design pose délibérément les fondations qu'il réutilisera : le moteur de
règles est une fonction pure appliquée à un jour, donc l'appliquer à N jours est direct.

## Périmètre

Dans le périmètre :

- Recommandation vestimentaire pour aujourd'hui et demain
- Localisation par géolocalisation navigateur, avec recherche de ville en secours
- Une page unique, aucun compte, aucun serveur

Hors périmètre :

- L'assistant valise (design ultérieur)
- Tout réglage utilisateur : la recommandation est générique, calibrée pour une personne
  moyennement frileuse. Pas de curseur de frilosité, pas de profil.
- Toute notion de garde-robe personnelle
- Les prévisions au-delà de demain

## Décisions de conception

### Aucune personnalisation

La recommandation est la même pour tout le monde. C'est un choix assumé : il supprime
l'état utilisateur, les écrans de réglage et la calibration, et permet à la page de
fonctionner utilement dès la première seconde. Le prix à payer est que les personnes très
frileuses ou très chaudes trouveront le barème décalé.

### Aucune étape de build

HTML, CSS et modules ES natifs. Pas de npm, pas de bundler, pas de transpilation.
Open-Meteo est gratuit, sans clé et sans inscription — il n'y a donc aucun secret à
protéger, et donc aucun backend à justifier. Les fichiers s'ouvrent directement dans un
navigateur et se déposent tels quels sur un hébergement statique.

Conséquence : les modules sont chargés via `<script type="module">`, ce qui impose l'origine
`http(s)://`. On sert le dossier avec n'importe quel serveur statique local
(`python3 -m http.server` par exemple) plutôt que d'ouvrir `index.html` en `file://`.

### « Aujourd'hui » couvre la journée entière

De 0 h à 24 h, quelle que soit l'heure de consultation. Le calcul est identique le matin et
le soir. Simple et prévisible ; on accepte qu'une consultation à 18 h tienne compte d'une
matinée déjà passée.

## Architecture

```
weather-clothes/
├── index.html
├── styles.css
├── js/
│   ├── weather.js     Open-Meteo → objet météo normalisé
│   ├── rules.js       PUR : météo → tenue          (le cœur)
│   ├── phrasing.js    PUR : tenue → phrase
│   ├── render.js      DOM
│   └── main.js        orchestration
└── test/
    ├── rules.test.js
    └── phrasing.test.js
```

Deux contrats de données constituent les seules interfaces entre modules. `weather.js` peut
changer de fournisseur météo sans que `rules.js` bouge ; `rules.js` peut changer de barème
sans que `phrasing.js` bouge.

`rules.js` et `phrasing.js` ne touchent ni au réseau ni au DOM. Ils sont testables en
isolation et réutilisables tels quels par le futur module valise.

### Contrat 1 — DayWeather

Produit par `weather.js`, consommé par `rules.js`. Un objet par jour.

```js
{
  date: '2026-08-07',            // ISO, jour local du lieu
  tempMin: 8,                    // °C
  tempMax: 14,
  feelsLikeMin: 5,               // °C ressentis (apparent temperature)
  feelsLikeMax: 12,
  precipitationMm: 3.2,          // cumul du jour
  precipitationProbability: 70,  // % max sur la journée
  windMaxKmh: 35,
  windGustsKmh: 55,
  uvIndex: 4,                    // max du jour
  weatherCode: 61,               // code WMO
}
```

Les champs sont toujours présents. Si l'API omet une valeur, `weather.js` la remplace par
une valeur neutre (0 pour les précipitations, le vent et l'UV) plutôt que `null`, afin que
`rules.js` n'ait jamais à faire de test de nullité.

### Contrat 2 — Outfit

Produit par `rules.js`, consommé par `phrasing.js` et `render.js`.

```js
{
  dressedFor: 18.4,            // °C ressentis visés par cette tenue
  layers: {
    top: ['t-shirt', 'pull'],    // du plus près du corps vers l'extérieur
    bottom: 'jean',
    outer: 'coupe-vent',         // ou null
    feet: 'baskets',
  },
  accessories: ['parapluie', 'écharpe'],
  alerts: [
    { kind: 'rain', severity: 'high', hint: 'Averses en fin de journée' },
  ],
}
```

`kind` appartient à : `rain`, `wind`, `swing`, `uv`, `ice`, `cold`, `heat`.
`severity` appartient à : `low`, `medium`, `high`.

## Moteur de règles

### On décide sur le ressenti

L'apparent temperature d'Open-Meteo intègre déjà le vent, l'humidité et le rayonnement
solaire. 12 °C avec 40 km/h de vent n'est pas 12 °C. Le barème s'appuie donc sur le
ressenti, pas sur la température brute.

### Le pivot est un point pondéré, biaisé vers le froid

    dressingPoint = feelsLikeMin + 0,4 × (feelsLikeMax − feelsLikeMin)

Viser le ressenti minimum seul serait trop prudent. Une amplitude de 12 °C n'a rien
d'exceptionnel en mi-saison : ce serait un pull imposé des journées entières qui montent à
27 °C — pas un cas limite, mais le cas courant. Viser la moyenne serait à l'inverse trop
optimiste, puisqu'on sort souvent le matin, au plus frais.

À 0,4 le point retenu reste sous la moyenne : le biais vers le froid est conservé sans la
caricature. Deux choses restent délibérément accrochées au ressenti **minimum**, parce
qu'elles concernent le moment le plus froid et non la journée moyenne : les gants et le
bonnet, qui tiennent dans une poche, et l'alerte `cold`.

Le point retenu est exposé dans l'Outfit sous `dressedFor`, ce qui permet à `phrasing.js`
d'annoncer le ressenti qui correspond réellement aux vêtements recommandés.

### Barème de base

Entrée : `dressingPoint`. Bornes inférieures incluses, supérieures exclues.

| Point d'habillage | Haut | Bas | Pieds |
|---|---|---|---|
| ≥ 25 °C | t-shirt | short | baskets |
| 20 – 25 | t-shirt | pantalon léger | baskets |
| 15 – 20 | t-shirt + chemise | pantalon | baskets |
| 10 – 15 | t-shirt + pull | jean | baskets |
| 5 – 10 | t-shirt + pull | jean | baskets |
| 0 – 5 | t-shirt + pull | jean | chaussures fermées |
| < 0 | sous-couche + t-shirt + pull | jean | chaussures fermées |

La couche extérieure (`outer`) suit le palier, et peut ensuite être remplacée par les
modificateurs :

| Point d'habillage | `outer` par défaut |
|---|---|
| ≥ 10 °C | `null` |
| 5 – 10 | veste |
| < 5 | manteau |

En dessous de 0 °C **de ressenti minimum** (et non de point d'habillage), `accessories`
reçoit d'office `gants` et `bonnet`.

Le barème de base émet aussi deux alertes de température, seules sources des `kind` `cold`
et `heat` :

- `feelsLikeMin < 0` → alerte `cold` en `high` (sur le minimum, pas sur le point d'habillage)
- `feelsLikeMax ≥ 30` → alerte `heat` en `medium`, `high` au-delà de 35 (hydratation, éviter
  le plein soleil)

### Modificateurs

Chacun est une fonction pure indépendante prenant `(DayWeather, Outfit)` et retournant un
`Outfit` modifié. Ils s'appliquent dans cet ordre.

| Modificateur | Déclencheur | Effet |
|---|---|---|
| Pluie | `precipitationProbability ≥ 40` ou `precipitationMm > 1` | `outer` devient imperméable, **sauf si c'était déjà un manteau** — un imperméable seul ne tient pas chaud par grand froid, on laisse alors le parapluie gérer l'eau. Ajoute `parapluie`, **sauf s'il neige** (code WMO de neige), où le parapluie ne sert à rien et où l'alerte parle de neige et non de pluie. Alerte `rain` |
| Vent | `windGustsKmh ≥ 40` | garantit une couche extérieure coupe-vent **si `dressedFor < 20 °C`** : au-dessus, le vent rafraîchit plutôt qu'il ne gêne, et un coupe-vent par 26 °C serait absurde — l'alerte `wind` est alors émise seule. Si `outer` est déjà un imperméable ou un manteau, il est conservé (ils coupent déjà le vent). Alerte `wind` |
| Vent fort | `windGustsKmh ≥ 60` | retire `parapluie` s'il a été ajouté ; alerte `wind` en `high` avec la mention que le parapluie est inutilisable |
| Amplitude | `feelsLikeMax − feelsLikeMin > 10` | alerte `swing` donnant les deux extrêmes (« 15 °C au plus frais, 30 °C au plus chaud »). L'écart se mesure sur le ressenti comme le reste du moteur : un fort écart de température réelle que le vent aplatit ne demande aucun ajustement. Puisqu'on habille pour un point intermédiaire, donner les deux bouts permet de juger soi-même s'il faut une couche de plus au départ |
| UV | `uvIndex ≥ 6` | ajoute `lunettes` ; alerte `uv` (crème solaire) |
| Neige / verglas | `weatherCode` dans les codes neige/grésil WMO | `feet` devient chaussures adhérentes ; alerte `ice` |

L'ordre compte : le modificateur Vent fort doit s'exécuter après Pluie pour pouvoir retirer
le parapluie que celui-ci vient d'ajouter.

Les codes WMO neige/grésil retenus sont : 71, 73, 75, 77, 85, 86 (neige) et 66, 67
(pluie verglaçante). Seuls les codes de neige suppriment le parapluie : sous une pluie
verglaçante, il reste utile.

## Formulation

`phrasing.js` transforme un `Outfit` et son `DayWeather` en une ou deux phrases, plus la
liste des points d'attention.

Ton : celui d'un proche qui te prévient avant que tu sortes.

L'accroche annonce `outfit.dressedFor`, le ressenti pour lequel la tenue a été décidée : la
phrase ne peut donc pas contredire les vêtements qu'elle recommande. Exception : quand une
alerte `heat` est levée, elle s'appuie sur le ressenti maximum, car même le point
d'habillage sous-vendrait la chaleur à venir.

> « Il va faire frisquet ce matin, 6 °C ressentis — pull et veste. Et prends un parapluie,
> ça tombe en fin d'aprèm. »

Le ton est produit par des gabarits comportant plusieurs variantes. **Le choix de la
variante est déterministe, dérivé de la date du jour** — pas aléatoire. La page ne change
donc pas de formulation d'un rechargement à l'autre, et les tests sont reproductibles.

Structure de sortie :

```js
{
  headline: 'Il va faire frisquet ce matin, 6 °C ressentis — pull et veste.',
  notes: ['Prends un parapluie, ça tombe en fin d\'aprèm.'],
}
```

`headline` n'est jamais vide. `notes` peut l'être et dérive des `alerts` de l'Outfit.

## Interface

Une page, deux blocs empilés : Aujourd'hui puis Demain.

Le parti pris visuel : **chaque bloc est un ciel**. Son dégradé de fond est dérivé du code
WMO du jour (dégagé, couvert, brouillard, pluie, neige, orage), avec une couleur d'encre
choisie pour chacun. On voit donc le basculement d'aujourd'hui à demain avant d'avoir lu un
mot. Le sélecteur de lieu flotte par-dessus le ciel du jour et en reprend l'encre.

Les rôles typographiques encodent une distinction réelle : une serif de lecture porte le
conseil, subjectif ; une monospace porte les mesures, objectives.

Aujourd'hui occupe environ 70 % de la hauteur d'écran, de sorte que Demain dépasse sous la
ligne de flottaison — sa taille de texte réduite dit la même chose que sa position.

Chaque bloc contient, de haut en bas :

1. le libellé du jour,
2. la phrase, en typographie large — c'est l'élément dominant,
3. un bandeau météo compact en typographie monospace : température réelle et ressentie
   (min → max), probabilité et cumul de pluie, rafales, indice UV, et la condition du code
   WMO **en toutes lettres** plutôt qu'en icône — un jeu d'icônes à maintenir n'apporterait
   rien de plus qu'« averses de neige »,
4. les points d'attention, en liste courte.

En haut de page, un sélecteur de lieu discret affichant la ville courante, cliquable pour
en changer.

## Données

Open-Meteo. Gratuit, sans clé, sans inscription.

Prévision — un seul appel couvre les deux jours :

```
https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &daily=temperature_2m_min,temperature_2m_max,
         apparent_temperature_min,apparent_temperature_max,
         precipitation_sum,precipitation_probability_max,
         windspeed_10m_max,windgusts_10m_max,uv_index_max,weathercode
  &forecast_days=2
  &timezone=auto
```

Géocodage, lorsque l'utilisateur saisit une ville :

```
https://geocoding-api.open-meteo.com/v1/search?name={query}&count=5&language=fr
```

Le lieu retenu (nom, latitude, longitude) est mémorisé en `localStorage` et réutilisé au
chargement suivant, ce qui évite de redemander la géolocalisation à chaque visite.

Ordre de résolution du lieu au démarrage : lieu en `localStorage`, sinon géolocalisation
navigateur, sinon invite à saisir une ville.

## Gestion des erreurs

| Situation | Comportement |
|---|---|
| Géolocalisation refusée ou indisponible | Bascule silencieuse vers le champ de recherche. C'est un choix de l'utilisateur, pas une panne — aucun message d'erreur. |
| API météo injoignable ou en erreur | Message explicite et bouton Réessayer. |
| Ville introuvable | Affichage des suggestions du géocodeur, ou message invitant à reformuler si la liste est vide. |
| Chargement en cours | Squelette à la place des blocs. |

## Tests

`node --test test/`. Aucune dépendance : le lanceur de tests natif de Node suffit.

`rules.test.js` — table de cas couvrant :

- canicule (ressenti ≥ 30) : pas de couche extérieure, short, alerte `heat`
- gel (ressenti < 0) : sous-couche, gants, bonnet, alerte `cold`
- pluie battante : imperméable et parapluie présents
- vent fort **et** pluie : parapluie absent, alerte `wind` en `high` — vérifie l'ordre des
  modificateurs
- forte amplitude : alerte `swing` présente, mentionnant les deux extrêmes
- amplitude réelle forte mais ressentie faible : pas d'alerte `swing`
- vent fort par temps chaud : alerte `wind` sans couche extérieure ajoutée
- point d'habillage : pondération correcte, biais vers le froid préservé, gants et alerte
  `cold` toujours accrochés au ressenti minimum
- neige : chaussures adhérentes, alerte `ice`
- chaque borne du barème de base

`phrasing.test.js` :

- `headline` jamais vide, quel que soit l'Outfit
- deux appels avec la même date produisent exactement la même sortie (déterminisme)
- deux dates différentes peuvent produire des variantes différentes
- chaque `alert` de l'Outfit produit une note correspondante

## Ce que ce design prépare pour la valise

Le module valise appellera `rules.js` sur chacun des N jours du séjour, puis unira les
tenues obtenues pour produire une liste d'articles avec des quantités. Aucune modification
de `rules.js` ni de `weather.js` ne sera nécessaire : seule la couche d'agrégation et
l'affichage seront à écrire.
