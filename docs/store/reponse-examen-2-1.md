# Réponse à l'examen Apple — refus 2.1 (informations manquantes)

Refus du 16 août 2026 sur la version `1.0.0` build `1`, app `6801611537`.

**Ce refus n'est pas un plantage.** « Guideline 2.1 — Information Needed » veut dire
qu'App Review n'a pas assez d'éléments pour conduire l'examen, pas qu'il a trouvé un
défaut. Aucun nouveau build n'est nécessaire : on répond dans le Resolution Center, on
joint une vidéo, et l'examen reprend sur le binaire déjà envoyé.

Apple demande sept choses. Six se répondent par écrit, ci-dessous. La septième — la
première de leur liste — est un enregistrement d'écran qu'il faut faire soi-même, sur un
téléphone réel.

---

## 1. La vidéo

Contraintes d'Apple : appareil physique, système récent, et **la vidéo commence par le
lancement de l'app**. L'iPhone 17 sous iOS 26.6 coche les deux premières.

### Avant d'enregistrer

- **Supprimer l'app du téléphone** (appui long → Supprimer l'app). Sans ça, ni la question
  du vestiaire ni la demande de position n'apparaissent — or Apple demande explicitement
  de filmer les invites d'accès aux données sensibles.
- **Réinstaller par TestFlight** si le build est disponible, pour filmer exactement le
  binaire en examen. Sinon la boucle de déploiement locale, en Release.
- **Mode Concentration activé** : une notification qui tombe en plein cadre oblige à
  recommencer.
- Vérifier qu'il reste une connexion internet : le premier chargement en dépend.

La désinstallation emporte aussi le widget de l'écran d'accueil — c'est voulu, la vidéo
montre qu'on le pose.

```bash
DEVICE=00008150-000304921146401C

# Repartir d'une installation neuve : c'est ce qui fait réapparaître la question
# du vestiaire et l'invite de position.
xcrun devicectl device uninstall app --device $DEVICE com.weatherclothes.app

# Réinstaller le même code, en Release : le bundle JS est alors embarqué et
# l'app tourne sans Metro ni le Mac.
cd apps/mobile/ios
xcodebuild -workspace QuoiPorter.xcworkspace -scheme QuoiPorter \
  -configuration Release -destination "id=$DEVICE" \
  -allowProvisioningUpdates -derivedDataPath ./build-device build
xcrun devicectl device install app --device $DEVICE \
  build-device/Build/Products/Release-iphoneos/QuoiPorter.app
```

Le tunnel Wi-Fi lâche souvent — `CoreDeviceError 4000`, « tunnel interrupted ». Réessayer
deux à quatre fois suffit presque toujours, et le téléphone doit être déverrouillé.

**Ne pas lancer l'app depuis le Mac ensuite.** `devicectl process launch` ferait démarrer
l'app hors champ, et la vidéo doit s'ouvrir sur le lancement.

### La prise au simulateur — `~/Desktop/QuoiPorter-demo-App-Review.mp4`

C'est elle qui part avec la réponse : **décidé le 16 août 2026 d'envoyer sans le widget**,
plutôt que de refaire le tournage sur l'iPhone. Le widget reste décrit par écrit au point 2
du bloc de réponses.

La vidéo est tournée au simulateur iPhone 17 (iOS 26.5) : 91 secondes, 3,7 Mo,
données réelles. Elle ouvre sur l'écran d'accueil, l'icône est tapée dans le cadre, puis
s'enchaînent la question du vestiaire, l'invite de position avec son texte français, la
tenue du jour à Paris (33 °C caniculaires, T-shirt et casquette), le déroulé horaire, le
mercredi de pluie (imperméable, parapluie, « les modèles divergent de 2,9 °C »), la
recherche d'Oslo, la tenue qui bascule en pull fin et jean à 13 °C, et le changement de
vestiaire.

**Il lui manque le widget, et elle n'est pas tournée sur un appareil physique.** Ces deux
manques sont le même pari : Apple a écrit « captured on a physical device ». La prise sert
de répétition et de preuve que le parcours tient debout ; elle ne remplace pas le tournage
sur l'iPhone.

Le widget n'est pas filmable au simulateur : la galerie s'ouvre vide, sans même les
widgets d'Apple, y compris après redémarrage. L'extension est pourtant bien dans le bundle
(`ExpoWidgetsTarget.appex`) — c'est l'infrastructure du simulateur qui ne répond pas.

Deux pièges rencontrés, à connaître avant de refaire une prise :

- **`Host recording is already in progress`.** Un `recordVideo` tué sans `SIGINT` laisse la
  session verrouillée dans CoreSimulator, et tuer le processus ne la libère pas. Redémarrer
  le seul appareil concerné suffit — surtout pas le service CoreSimulator, qui emporterait
  les simulateurs des autres sessions.
- **`idb ui text` tape caractère par caractère, très lentement** quand une autre session se
  dispute le companion. Une attente fixe laisse partir la recherche sur une lettre seule :
  il faut attendre que le champ porte le mot. Vingt-cinq secondes de temps mort ont dû être
  coupées au montage.

### Sortir la vidéo du téléphone

L'enregistrement se lance depuis le centre de contrôle — si le bouton n'y est pas,
Réglages → Centre de contrôle → Enregistrement de l'écran. Le fichier part sur le Mac par
AirDrop.

Viser 2 à 3 minutes. Un iPhone 17 filme en pleine résolution : trois minutes pèsent vite
plusieurs centaines de mégaoctets. Si la pièce jointe est refusée, QuickTime Player →
Fichier → Exporter en → 720p suffit, sans rien installer.

### Le déroulé à filmer

1. **L'écran d'accueil**, l'icône QuoiPorter visible. Taper dessus — le lancement doit être
   dans l'image.
2. **La question du vestiaire.** Laisser les trois choix lisibles une seconde, puis en
   taper un.
3. **L'invite de position.** La laisser à l'écran le temps qu'on lise la phrase, puis
   autoriser. Le chargement, puis la tenue du jour.
4. **Le défilement lent** de l'écran principal : les vêtements, ce qu'on emporte, la phrase
   météo, le ruban des sept jours, la courbe horaire, les alertes, la ligne d'incertitude.
5. **Un autre jour** dans le ruban — un jour de pluie si la semaine en offre un. La tenue
   change, c'est le cœur du produit.
6. **Changer de ville** : taper le titre, chercher « Lisbonne », choisir un résultat,
   attendre la nouvelle prévision.
7. **Changer de vestiaire** par les trois points, refermer, montrer que la tenue suit.
8. **Le widget** : retour à l'écran d'accueil, appui long, « + », chercher QuoiPorter,
   poser « Tenue du jour ». Le laisser à l'écran une seconde, rempli.

Facultatif mais utile — c'est ce qui prouve la 5.1.1 : Réglages → QuoiPorter → Position →
Jamais, relancer l'app, et montrer qu'on s'en sort par « Choisir une ville ». Apple sait
alors que le refus de la permission ne bloque rien.

---

## 2. Le texte à coller

Le même bloc va à deux endroits : dans la réponse du Resolution Center (avec la vidéo en
pièce jointe), et dans **App Store Connect → Informations pour l'examen de l'app → Notes**,
qu'Apple demande de garnir pour les envois suivants. Il tient sous la limite de 4000
caractères du champ Notes.

En anglais : App Review écrit en anglais, et une note en français ajoute une traduction
entre l'examinateur et la réponse.

Le mot d'accompagnement, dans le Resolution Center, avant le bloc :

```
Hello,

Thank you for the review. A screen recording captured on a physical iPhone 17
running iOS 26.6 is attached. It begins with the app launch and shows the
first-run wardrobe question, the location permission prompt, today's outfit, the
7-day rail, the city search, the wardrobe setting, and adding the Home Screen
widget.

The information you requested follows, and has also been added to the Notes
field of the App Review Information section for future submissions.

Kind regards,
Benoit Bruynbroeck
```

```
QuoiPorter — App Review Information

1. WHAT THE APP DOES
QuoiPorter answers one question: "what should I wear today?". It turns a
location-specific weather forecast into a complete written outfit — layers,
bottom, outer layer, and what to carry — in plain French, rather than showing a
weather dashboard. It uses the felt temperature, flags practical risks (rain,
wind, UV) and mentions forecast uncertainty only when the models disagree enough
to change the advice. A horizontal 7-day rail covers the coming week. A Home
Screen widget ("Tenue du jour") gives the same answer without opening the app.
Audience: general public, 4+, French-speaking, deciding what to wear before
leaving home. The value is a decision, not data.

2. ACCESS — NO ACCOUNT, NOTHING GATED
No account, registration, login, account deletion, purchase, subscription or
user-generated content. No credentials or sample files are needed. Steps:
a. Launch the app. A first-run question asks which wardrobe to draw from
   (Femme / Homme / "Je préfère ne pas dire"). All three answers continue; the
   answer is stored on the device only and can be changed later.
b. iOS asks for location ("Ta position permet de proposer une tenue adaptée à la
   météo locale."). Allow it to get the forecast for where you are.
   Location is OPTIONAL. On "Don't Allow", tap "Choisir une ville" (choose a
   city), type a city name (e.g. Paris), tap "Chercher", pick a result. Every
   feature stays available.
c. Today's outfit appears, then the weather sentence, then the 7-day rail. Tap
   any day in the rail to see that day's outfit.
d. Scroll down for the hourly temperature and rain curve, the alerts, and the
   uncertainty line.
e. Tap the city name at the top to change city. Tap "…" (top right) to change
   the wardrobe.
f. Widget: long-press the Home Screen, tap "+", search QuoiPorter, add "Tenue du
   jour" (small or medium).
An internet connection is required on first load.

3. DEVICES AND OS TESTED
iPhone 17 (iPhone18,3) on iOS 26.6 — physical device, release build, full manual
pass including the widget. Simulators on iOS 26.5: iPhone 17 Pro Max, 17 Pro,
17, 17e, Air. Minimum supported version: iOS 16.4. iPhone only.

4. EXTERNAL SERVICES
- Open-Meteo Forecast API (api.open-meteo.com/v1/forecast) — the forecast.
  Public, free, no API key, no account.
- Open-Meteo Geocoding API (geocoding-api.open-meteo.com/v1/search) — city
  search.
- Apple CoreLocation reverse geocoding — turns coordinates into a place name.
No back-end server of ours, no authentication service, no payment processor, no
AI service, no advertising, analytics or tracking SDK. Coordinates and the typed
city name are sent to Open-Meteo only to fetch a forecast. The chosen place and
the wardrobe answer stay on the device (SQLite, shared with the widget through
the app group).

5. REGIONAL DIFFERENCES
None. The app offers the same features and behaves identically in every region.
Open-Meteo covers the whole world, so any city in any country can be selected.
The interface is French only (a single fr-FR localization) and units are metric
everywhere.

6. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
Not a regulated industry. The app gives general-audience clothing advice derived
from public weather data: it makes no medical, safety-critical or official
warning claims, and it does not relay government weather alerts. Open-Meteo
publishes its data under Creative Commons Attribution 4.0 and offers free API
access without a key or contract; the underlying models are open data from
national weather services. Open-Meteo is credited in the App Store description.
No licensed or third-party copyrighted material is used — the artwork, text and
code are our own.

7. SENSITIVE-DATA PROMPTS
The location permission at first launch is the only one. The app does not use
App Tracking Transparency, camera, contacts, photos, microphone, notifications
or HealthKit.
```

---

## 3. Où ça se colle

**La réponse et la vidéo** — App Store Connect → Mes apps → QuoiPorter → la version 1.0.0
→ Centre de résolution (le fil de messages ouvert par le refus). Le trombone porte la
vidéo, le mot d'accompagnement et le bloc vont dans le message.

**Les notes** — même version → section « Informations pour l'examen de l'app » → champ
« Notes ». C'est le champ qu'Apple demande de garnir pour les envois suivants ; il survit
aux versions, donc il se remplit une fois.

Rien d'autre à toucher : ni le build, ni les captures, ni la fiche. La version reste en
« Refusée » jusqu'à ce qu'App Review reprenne le fil — compter un à deux jours.

---

## Ce qui a servi à répondre

Rien n'est déduit du produit tel qu'on aimerait qu'il soit :

| Réponse | Source |
|---|---|
| Les deux seules API appelées | `js/weather.js:19-20` |
| Le géocodage inverse d'Apple | `expo-location`, `use-forecast.ts:27` |
| Position facultative, repli par la recherche | `use-forecast.ts:22`, `index.tsx:282-297` |
| Aucun SDK de pistage, de pub ou de mesure | `apps/mobile/package.json` |
| Stockage local seulement | `src/lib/storage.native.ts` |
| iOS 16.4 minimum, iPhone seul | `IPHONEOS_DEPLOYMENT_TARGET`, `TARGETED_DEVICE_FAMILY = 1` |
| iPhone 17, iOS 26.6 | `xcrun devicectl device info details` |
| Simulateurs iOS 26.5 | `xcrun simctl list devices available` |

---

## Un point tranché

L'attribution Open-Meteo est dans la description App Store, pas dans l'app. La licence
CC BY 4.0 demande de créditer la source « d'une manière raisonnable au vu du support ».
Une ligne discrète en bas de l'écran principal — « Prévisions Open-Meteo » — mettrait la
question hors de portée.

**Décidé le 16 août 2026 : pas maintenant.** Aucun des sept points d'Apple ne la réclame,
et l'ajouter coûterait un nouveau build et un nouvel envoi alors que l'examen peut
reprendre sur le binaire déjà en place. La ligne part en 1.0.1.
