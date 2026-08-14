# Fiche App Store — QuoiPorter (fr-FR)

App Store Connect : app `6801611537` · bundle `com.weatherclothes.app` · version `1.0.0` build `1`
Langue principale : français (France). iPhone uniquement (`TARGETED_DEVICE_FAMILY = 1`).

---

## Informations sur l'app

**Nom** (30 max — 10 utilisés)

```
QuoiPorter
```

**Sous-titre** (30 max — 28 utilisés)

```
La bonne tenue, chaque matin
```

**Catégorie principale** : Météo
**Catégorie secondaire** : Style de vie

**Droits d'auteur** : `2026 Benoit Bruynbroeck`

> Apple n'attend ni le symbole © ni la mention « tous droits réservés » : il les ajoute
> lui-même. Ce champ nomme qui détient les droits, il est distinct du nom de développeur
> affiché sur la fiche, qui vient du compte Apple Developer.

---

## Version 1.0.0

**Texte promotionnel** (170 max — 156 utilisés · modifiable sans nouvelle soumission)

```
Chaque matin, la tenue complète pour la météo du jour : les habits, la couche du dessus, les chaussures et ce qu'il faut emporter. Sans compte, sans réglages.
```

**Description** (4000 max — ~1180 utilisés)

```
QuoiPorter répond à la seule question qui compte avant de sortir : qu'est-ce que je mets ?

Pas un tableau de bord météo. Une tenue complète, écrite en français clair, pour le temps qu'il va vraiment faire là où tu es.

CE QUE TU VOIS EN OUVRANT L'APP

La tenue du jour, d'abord. Les habits, la couche du dessus, les chaussures, et ce qu'il vaut mieux emporter. Le détail météo vient après, pour ceux qui veulent comprendre.

La température ressentie plutôt que le chiffre brut : 8 degrés avec du vent ne s'habillent pas comme 8 degrés au soleil.

L'incertitude, seulement quand elle change quelque chose. Si les modèles ne sont pas d'accord sur la pluie de cet après-midi, on te le dit. Sinon on ne t'encombre pas.

Sept jours à faire défiler quand tu prépares la semaine, sans transformer l'écran en console de données.

LE WIDGET

« Tenue du jour » sur l'écran d'accueil : la réponse est là avant même d'ouvrir l'app. Deux tailles, contenu volontairement court.

SANS FRICTION

Aucun compte. Aucun réglage à remplir. L'app trouve ta position, ou tu cherches ta ville — et elle s'en souvient.

Prévisions Open-Meteo. Pas de publicité, pas de pistage, pas de revente de données.
```

**Mots-clés** (100 max — 97 utilisés · séparés par des virgules, sans espace après)

```
météo,vêtements,habits,pluie,froid,quoi mettre,s'habiller,prévisions,widget,matin,parapluie,veste
```

> « tenue » est déjà dans le sous-titre : inutile de le répéter ici, Apple indexe les deux.

**Nouveautés de cette version** — laisser vide pour un premier envoi (champ réservé aux mises à jour).

---

## Liens obligatoires

| Champ | Valeur |
|---|---|
| URL de support | `https://bbenoit.fr/quoiporter/support.html` |
| URL de politique de confidentialité | `https://bbenoit.fr/quoiporter/confidentialite.html` |
| URL marketing | facultatif — laisser vide |

Les deux pages sont écrites et prêtes à publier : `site/quoiporter/` à la racine du repo
(`support.html`, `confidentialite.html`, `page.css`). Copie le dossier `quoiporter/` à la
racine de ce que sert `bbenoit.fr` et les URL ci-dessus fonctionnent telles quelles.

Deux remarques :

- Apple n'exige **aucune** correspondance entre le domaine et le nom de l'app. Une page
  qui parle de QuoiPorter et donne un contact valide passe l'examen, même sur un domaine
  personnel sans rapport.
- L'extension `.html` est explicite exprès : ça marche sur n'importe quel hébergement
  statique, sans règle de réécriture.

**À vérifier avant d'envoyer** : j'ai utilisé `contact@bbenoit.fr` comme adresse de
support dans les deux pages, par déduction du domaine. Si ce n'est pas la bonne, remplace-la
— App Review teste réellement le lien.

---

## Confidentialité de l'app

Réponses tirées du code, pas d'une supposition :

- Aucune dépendance de pistage, d'analytics ou de publicité dans `package.json`.
- Deux appels réseau seulement : `api.open-meteo.com/v1/forecast` et
  `geocoding-api.open-meteo.com/v1/search`.
- Stockage local uniquement (`src/lib/storage.native.ts`, expo-sqlite).

**Données collectées : Position → Position précise**

| Question ASC | Réponse |
|---|---|
| Utilisée pour le suivi ? | Non |
| Liée à l'identité de l'utilisateur ? | Non |
| Finalité | Fonctionnalité de l'app |

Aucune autre catégorie à déclarer : pas d'identifiants, pas de données d'utilisation,
pas de coordonnées.

> **Un point à trancher toi-même** : le nom de ville tapé dans la recherche part vers
> l'API de géocodage. Apple pourrait le ranger sous « Historique de recherche ». La
> plupart des apps météo ne le déclarent pas, et il n'est ni stocké ni lié à une
> identité — mais c'est ton appel, pas le mien.

**Classification par âge** : 4+ (aucun contenu sensible).

**Conformité à l'export** : déjà réglé, `ITSAppUsesNonExemptEncryption = false` est dans
`app.json` — App Store Connect ne posera pas la question.

---

## Politique de confidentialité

Déjà écrite et mise en page : `site/quoiporter/confidentialite.html`. Le texte brut ci-dessous
sert de référence si tu dois la recopier ailleurs (Android, site tiers).

```
Politique de confidentialité — QuoiPorter

QuoiPorter ne crée aucun compte et ne collecte aucune donnée personnelle
à des fins commerciales.

Position
Avec ton autorisation, l'app lit la position de ton appareil pour chercher la
météo de l'endroit où tu es. Les coordonnées sont envoyées au service de
prévisions Open-Meteo (open-meteo.com) pour obtenir le bulletin, et ne sont
transmises à personne d'autre. Tu peux refuser cette autorisation et chercher
ta ville à la main : l'app fonctionne normalement.

Ce qui reste sur ton téléphone
Le lieu choisi et tes préférences de garde-robe sont enregistrés uniquement
sur l'appareil. Ils ne sont envoyés sur aucun serveur et disparaissent quand
tu supprimes l'app.

Ce que l'app ne fait pas
Aucune publicité. Aucun pistage. Aucun outil de mesure d'audience. Aucune
revente ni partage de données à des tiers. Aucun profil publicitaire.

Enfants
L'app ne s'adresse pas spécifiquement aux enfants et ne collecte sciemment
aucune donnée les concernant.

Contact
contact@bbenoit.fr

Dernière mise à jour : 14 août 2026
```

---

## Notes pour l'examen Apple

```
Aucun compte n'est nécessaire, l'app est utilisable immédiatement.

L'autorisation de localisation est facultative. Si vous la refusez, utilisez la
recherche de ville pour choisir un lieu — toutes les fonctions restent
accessibles.

Les prévisions viennent de l'API publique Open-Meteo, sans clé ni serveur
intermédiaire. Une connexion internet est nécessaire au premier chargement.

Le widget « Tenue du jour » s'ajoute depuis l'écran d'accueil iOS et reprend la
recommandation du jour.
```

---

## Captures d'écran

Requis : **iPhone 6,9 pouces**, portrait, `1290 × 2796` ou `1320 × 2868` px, 3 à 10 images.
C'est le seul jeu obligatoire — Apple redimensionne pour les écrans plus petits, et l'iPad
n'est pas concerné puisque l'app est iPhone uniquement.

Le simulateur iPhone 17 Pro Max sort exactement du `1320 × 2868`. La barre d'état se force
à la convention App Store avant de capturer :

```bash
U=$(xcrun simctl list devices available | grep -m1 'iPhone 17 Pro Max' | grep -oE '[0-9A-F-]{36}')
xcrun simctl status_bar $U override --time "09:41" \
  --batteryState discharging --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3 --dataNetwork wifi
xcrun simctl io $U screenshot --type=png 01-aujourdhui.png
```

La navigation passe par l'arbre d'accessibilité plutôt que par des coordonnées en dur —
tous les éléments de l'écran sont correctement étiquetés, `idb ui describe-all` les liste
avec leurs positions, et `idb ui tap x y` suit.

Série retenue, dans cet ordre (le nom du fichier fait l'ordre d'affichage) :

1. La tenue du jour — l'écran d'ouverture, le cœur du produit
2. Un jour de pluie — montre que le conseil change vraiment
3. La bande des sept jours
4. Un aveu d'incertitude affiché
5. Le widget sur l'écran d'accueil

**À faire le matin.** Le ciel suit l'heure : capturé le soir, tout le jeu ressort nocturne,
et une fiche entièrement grise vend mal une app qui parle de s'habiller le matin.

**À vérifier à l'œil avant d'envoyer.** Le ciel est un shader Skia. S'il ne compile pas,
`js/sky.js` renvoie un repli uni — repérable sur une capture, parce que le dégradé
disparaît. Mais une erreur plus fine dans le shader donnerait une image plausible et
fausse : un coup d'œil humain reste nécessaire.

---

## Envoi des captures

`apps/mobile/scripts/upload-screenshots.mjs`, sans aucune dépendance à installer :

```bash
cd apps/mobile
ASC_ISSUER_ID=$(cat ~/.appstoreconnect/issuer-id) \
  node scripts/upload-screenshots.mjs ../../docs/store/captures
```

Ajouter `--replace` pour vider le jeu existant avant d'envoyer.

Le script réserve chaque emplacement, pousse les octets, puis **confirme avec l'empreinte
MD5** — sauter cette confirmation laisse une capture fantôme, visible dans la fiche mais
jamais publiée.

Ce qu'il lui faut :

| | |
|---|---|
| Clé privée | `~/.appstoreconnect/private_keys/AuthKey_C9Y9B2RFPK.p8` — en place, `chmod 600` |
| Key ID | `C9Y9B2RFPK` (défaut du script) |
| App ID | `6801611537` (défaut du script) |
| Issuer ID | en place dans `~/.appstoreconnect/issuer-id`, `chmod 600` — hors du repo exprès |

Le `.p8` traînait à la racine du repo sans règle d'ignore : il est déplacé, et `*.p8` est
maintenant dans `.gitignore`. Il n'a jamais été committé — vérifié sur tout l'historique.
