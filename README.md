# Qu'est-ce que je mets ?

Une page qui répond à une seule question, le matin, en quatre secondes : que faut-il porter
aujourd'hui, et demain ?

Le fond est une scène 3D dont le ciel reprend la météo réelle et l'heure du lieu. On fait
défiler, et la scène se métamorphose sous le doigt pour passer d'aujourd'hui à demain.

## Lancer

```sh
npm run serve      # sert le dossier sur http://localhost:8000
```

- `/` — la page
- `/preview.html` — **banc d'essai** : la scène pour n'importe quelle météo, n'importe quelle
  heure, n'importe quel vent. C'est là qu'on juge et qu'on règle les ciels sans attendre
  qu'il neige.

Les modules ES imposent l'origine `http://` — ouvrir `index.html` en `file://` ne marchera
pas. Aucun `npm install` n'est nécessaire : le projet n'a aucune dépendance.

## Tester

```sh
npm test           # node --test, natif, sans dépendance
```

## Comment ça marche

Des modules purs au centre, trois contrats de données entre eux : `DayWeather`, `Outfit`,
`SkyMood`.

| Module | Rôle |
|---|---|
| `js/weather.js` | Open-Meteo → `DayWeather` normalisé |
| `js/rules.js` | **pur** — `DayWeather` → `Outfit` |
| `js/phrasing.js` | **pur** — `Outfit` → phrase et points d'attention |
| `js/sky.js` | **pur** — `DayWeather` + instant → `SkyMood` |
| `js/timeline.js` | **pur** — `DayWeather` + instant → géométrie du déroulé horaire |
| `js/scene/` | le moteur three.js : dôme, nuages, précipitations, qualité |
| `js/render.js` | DOM |
| `js/main.js` | orchestration |

Les modules purs ne touchent ni au réseau ni au DOM : ils sont testés en isolation, et
réutilisables tels quels par le futur assistant valise.

La phrase principale accueille **une** clause quand quelque chose change ce qu'on emporte —
parapluie, capuche, semelles qui accrochent. Une seule : en promouvoir plusieurs diluerait
ce qui fait la brièveté de la page. L'alerte promue quitte alors les notes, pour qu'aucune
information ne soit dite deux fois.

Sous la phrase, une courbe trace le ressenti heure par heure avec la pluie en dessous. Elle
part de l'heure qu'il est pour aujourd'hui, de 8 h pour demain, et disparaît en fin de
soirée quand il reste trop peu d'heures pour tracer autre chose qu'un segment trompeur.

`sky.js` isole complètement la scène de la météo — `scene/` ne connaît que des paramètres
d'ambiance normalisés, jamais un code WMO. Tout y découle d'un seul nombre continu, la
hauteur du soleil, calculée **à l'heure du lieu consulté** et non à celle du navigateur.

La scène est une **amélioration progressive** : si three.js ne se charge pas, ou si WebGL
manque, la page retombe sur un dégradé CSS calculé depuis le même `SkyMood`. Rien de ce
qu'elle raconte n'est perdu.

Deux partis pris dans le moteur de règles :

- **on décide sur le ressenti**, pas sur la température brute — l'apparent temperature
  d'Open-Meteo intègre déjà vent, humidité et rayonnement ;
- **on habille pour un point pondéré**, `ressenti min + 0,4 × amplitude` : viser le minimum
  seul imposerait un pull des journées entières qui montent à 27 °C, viser la moyenne
  oublierait qu'on sort souvent le matin. Gants, bonnet et alerte de gel restent, eux,
  accrochés au ressenti minimum.

Le design complet est dans
[docs/superpowers/specs/2026-08-07-tenue-du-jour-design.md](docs/superpowers/specs/2026-08-07-tenue-du-jour-design.md).

## Données

[Open-Meteo](https://open-meteo.com) — gratuit, sans clé, sans inscription. Aucun backend,
aucun compte, aucun secret. Le lieu choisi est mémorisé en `localStorage`.

## À venir

L'assistant valise : « je pars 3 jours là-bas, dis-moi quoi emporter ». Il appliquera
`rules.js` à chacun des N jours du séjour et unira les tenues obtenues.

## Une limite assumée

Les modules `js/scene/*` parlent à WebGL et ne sont donc pas testables sous Node. Ils sont
vérifiés à l'œil, via `preview.html`. Les shaders y sont réglés à la main : si un ciel te
déplaît, c'est là qu'on le change.
