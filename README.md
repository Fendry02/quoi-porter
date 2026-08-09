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
  heure, n'importe quel vent, avec un curseur pour parcourir la métamorphose d'aujourd'hui
  vers demain. C'est là qu'on juge et qu'on règle les ciels sans attendre qu'il neige.

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
| `js/ensemble.js` | **pur** — médiane et étendue sur plusieurs modèles météo |
| `js/hours.js` | **pur** — fenêtre du jour, plages, pics, et leur mise en mots |
| `js/timeline.js` | **pur** — `DayWeather` + instant → géométrie du déroulé horaire |
| `js/scene/` | le moteur three.js : dôme, nuages, précipitations, qualité |
| `js/render.js` | DOM |
| `js/main.js` | orchestration |

Les modules purs ne touchent ni au réseau ni au DOM : ils sont testés en isolation, et
réutilisables tels quels par le futur assistant valise.

**La tenue passe avant tout le reste**, et elle est entière : haut, bas, couche extérieure,
chaussures, puis ce qu'on emporte. C'est la seule chose que la page a promis de dire, donc
c'est la première et la plus grande. La météo devient sa légende.

Une version précédente noyait les vêtements au milieu d'une phrase météo et en taisait la
moitié — « ce qui va de soi » — si bien qu'on ne voyait jamais une tenue, seulement des
fragments : le moteur décidait « t-shirt, pull, jean, imperméable, baskets » et la page
affichait « pull et imperméable ». On dit désormais tout, même le jean.

**Chaque point d'attention porte son heure**, en tête et en monospace : on parcourt la marge
gauche et on sait quand les choses arrivent sans lire les phrases. « Il va bien pleuvoir »
sans horaire n'est qu'une demi-information.

Les mêmes événements sont **posés sur l'axe** sous la courbe, à l'échelle exacte du tracé —
une barre par événement, une pastille pour un instant. Lire les notes une par une oblige à
reconstituer la journée de tête ; la frise la donne d'un coup, avec les chevauchements.

Chaque barre **porte son horodatage** : sans lui, elle dit « quoi » et « combien de temps »
mais jamais « quand », et il faut redescendre à l'axe pour interpoler entre deux repères
espacés de quatre heures. Ce sont les heures bornées à la fenêtre, celles que la barre
dessine réellement — l'horodatage ne peut pas contredire le trait qu'il légende.

Le libellé se place après la barre, avant elle si la fin serre le bord droit, au-dessus
lorsqu'il n'y a de place d'aucun côté. Ce dernier cas est réel : une pluie qui dure toute la
journée occupe toute la largeur. La décision demande la largeur mesurée du libellé et celle
du tracé, donc elle se prend après disposition — et se reprend à chaque redimensionnement.

Sous la phrase, une courbe trace le ressenti heure par heure avec la pluie en dessous. Elle
part de l'heure qu'il est pour aujourd'hui, de 8 h pour demain, et disparaît en fin de
soirée quand il reste trop peu d'heures pour tracer autre chose qu'un segment trompeur.

**L'axe est gradué heure par heure.** Une graduation toutes les quatre heures obligeait à
interpoler à l'œil pour situer 18 h, alors que c'est l'heure exacte qu'on cherche — et que
les barres de la frise s'alignent, elles, sur chaque heure. L'unité ne s'écrit qu'une fois,
sur la première étiquette : « 8 h, 9, 10 » se lit sans ambiguïté et laisse respirer le reste.
Passé dix-huit heures affichées, un nombre sur deux se tait pour ne pas se chevaucher sur un
téléphone ; les graduations, elles, restent horaires.

`hours.js` définit cette fenêtre une seule fois, pour le texte comme pour le tracé : sans
ça, la courbe pourrait montrer une averse que les notes passeraient sous silence.

`sky.js` isole complètement la scène de la météo — `scene/` ne connaît que des paramètres
d'ambiance normalisés, jamais un code WMO. Tout y découle d'un seul nombre continu, la
hauteur du soleil, calculée **à l'heure du lieu consulté** et non à celle du navigateur.

La scène est une **amélioration progressive** : si three.js ne se charge pas, ou si WebGL
manque, la page retombe sur un dégradé CSS calculé depuis le même `SkyMood`. Rien de ce
qu'elle raconte n'est perdu. Elle est aussi chargée **en parallèle** de la requête météo,
jamais avant : la phrase n'a aucune raison d'attendre 170 Ko d'animation.

La prévision se revalide au retour sur l'onglet et toutes les dix minutes, sans faire
clignoter le squelette. Sans ça, une page ouverte le matin conseillerait encore la tenue du
matin le soir venu — et après minuit, le « jour 0 » de la prévision serait devenu la veille.

Deux partis pris dans le moteur de règles :

- **on décide sur le ressenti**, pas sur la température brute — l'apparent temperature
  d'Open-Meteo intègre déjà vent, humidité et rayonnement ;
- **on habille pour un point pondéré**, `ressenti min + 0,4 × amplitude` : viser le minimum
  seul imposerait un pull des journées entières qui montent à 27 °C, viser la moyenne
  oublierait qu'on sort souvent le matin. Gants, bonnet et alerte de gel restent, eux,
  accrochés au ressenti minimum.

Le design complet est dans
[docs/superpowers/specs/2026-08-07-tenue-du-jour-design.md](docs/superpowers/specs/2026-08-07-tenue-du-jour-design.md).

L'onglet porte la **réponse** plutôt que la question — « T-shirt · 25° · Paris ». Dans une
fenêtre pleine d'onglets, « Qu'est-ce que je mets ? » n'apprend rien à qui a déjà ouvert la
page ; ce titre-là reste pour l'attente, avant qu'on sache quoi que ce soit.

La favicon est un SVG unique, net à toutes les tailles, qui suit le thème clair ou sombre du
système : une icône noire ferait un trou dans une barre d'onglets sombre.

## Données

[Open-Meteo](https://open-meteo.com) — gratuit, sans clé, sans inscription. Aucun backend,
aucun compte, aucun secret. Le lieu choisi est mémorisé en `localStorage`.

**Cinq centres de prévision** sont interrogés d'un coup : ECMWF, GFS, Météo-France, ICON et
UK Met Office. On en prend la **médiane**, plus robuste qu'un modèle isolé — et à Oslo elle
diffère de 1,6 °C du modèle par défaut, assez pour changer la tenue.

Mais le vrai gain n'est pas la précision, c'est de **savoir quand ne pas faire confiance**.
La page ne prévient pas sur un seuil en degrés : le désaccord typique tourne autour de 2 °C,
un seuil fixe crierait au loup une fois sur deux. Elle habille au bas de la fourchette, puis
au haut, et ne dit quelque chose que si les vêtements diffèrent. La courbe porte en outre une
bande claire montrant l'écart entre modèles.

Chaque variable est agrégée sur les modèles qui la publient, jamais modèle par modèle :
ECMWF n'a pas les rafales, Météo-France et UKMO n'ont pas la probabilité de pluie. Compter
une absence pour zéro ferait passer une journée pluvieuse pour sèche.

Si la requête d'ensemble échoue, on retombe sur une requête simple — et on affiche alors
franchement aucun désaccord plutôt que d'en inventer un.

## À venir

L'assistant valise : « je pars 3 jours là-bas, dis-moi quoi emporter ». Il appliquera
`rules.js` à chacun des N jours du séjour et unira les tenues obtenues.

## Une limite assumée

Les modules `js/scene/*` parlent à WebGL et ne sont donc pas testables sous Node. Ils sont
vérifiés à l'œil, via `preview.html`. Les shaders y sont réglés à la main : si un ciel te
déplaît, c'est là qu'on le change.
