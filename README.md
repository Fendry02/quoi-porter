# Qu'est-ce que je mets ?

Une page qui répond à une seule question, le matin, en quatre secondes : que faut-il porter
aujourd'hui, et demain ?

Chaque journée est un panneau dont le ciel reprend la météo réelle de ce jour-là. On voit le
basculement d'aujourd'hui à demain avant d'avoir lu un mot.

## Lancer

```sh
npm run serve      # sert le dossier sur http://localhost:8000
```

Les modules ES imposent l'origine `http://` — ouvrir `index.html` en `file://` ne marchera
pas. Aucun `npm install` n'est nécessaire : le projet n'a aucune dépendance.

## Tester

```sh
npm test           # node --test, natif, sans dépendance
```

## Comment ça marche

Quatre modules, deux contrats de données entre eux.

| Module | Rôle |
|---|---|
| `js/weather.js` | Open-Meteo → `DayWeather` normalisé |
| `js/rules.js` | **pur** — `DayWeather` → `Outfit` |
| `js/phrasing.js` | **pur** — `Outfit` → phrase et points d'attention |
| `js/render.js` | DOM |
| `js/main.js` | orchestration |

`rules.js` et `phrasing.js` ne touchent ni au réseau ni au DOM : ils sont testés en
isolation, et réutilisables tels quels par le futur assistant valise.

Deux partis pris dans le moteur de règles :

- **on décide sur le ressenti**, pas sur la température brute — l'apparent temperature
  d'Open-Meteo intègre déjà vent, humidité et rayonnement ;
- **on habille pour le ressenti minimum** du jour, parce qu'avoir froid est plus pénible
  qu'avoir un peu trop chaud et qu'une couche s'enlève.

Le design complet est dans
[docs/superpowers/specs/2026-08-07-tenue-du-jour-design.md](docs/superpowers/specs/2026-08-07-tenue-du-jour-design.md).

## Données

[Open-Meteo](https://open-meteo.com) — gratuit, sans clé, sans inscription. Aucun backend,
aucun compte, aucun secret. Le lieu choisi est mémorisé en `localStorage`.

## À venir

L'assistant valise : « je pars 3 jours là-bas, dis-moi quoi emporter ». Il appliquera
`rules.js` à chacun des N jours du séjour et unira les tenues obtenues.
