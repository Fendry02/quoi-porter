# Alertes de dépendances

Ce que disent les alertes du dépôt, ce qui a été corrigé, et ce qui ne peut pas l'être.

Dernière revue : 15 août 2026.

## Lire les chiffres

`npm audit` annonce 16 paquets touchés dans `apps/mobile`. Il n'y a qu'**une** cause : les
quinze autres sont des paquets qui dépendent, de proche en proche, du même fautif. Compter
les chaînes plutôt que les causes donne un nombre impressionnant et faux.

Pour voir les causes réelles :

```bash
cd apps/mobile
npm audit --json | python3 -c "
import sys, json
d = json.load(sys.stdin)
racines = {}
for nom, v in d.get('vulnerabilities', {}).items():
    for via in v.get('via', []):
        if isinstance(via, dict):
            racines.setdefault(via['name'], set()).add(via.get('severity'))
print(racines)
"
```

## Corrigé

**`uuid` — GHSA-w5hq-g745-h8pq, modérée.** Absence de contrôle de bornes dans `v3`, `v5` et
`v6` quand un buffer est fourni. La version installée était `7.0.3`, tirée par
`expo-splash-screen > @expo/config-plugins > xcode`.

Un `override` la place en `11.1.1` — il n'existe aucun correctif sur la branche 7.

La faille était de toute façon inatteignable par ce chemin : `xcode` n'appelle que
`uuid.v4()`, jamais `v3`/`v5`/`v6`, et jamais avec un buffer. L'override sert donc surtout
à fermer l'alerte. Vérifié après coup : `xcode` charge, génère un identifiant au bon format
(24 hexadécimaux majuscules), relit `project.pbxproj` avec ses deux cibles, et
`expo config --type prebuild` sort en 0.

## Sans correctif possible

**`image-size` — GHSA-w3rx-r6r6-pgpr et GHSA-5p2g-fcmc-qvqq, hautes.** Les analyseurs ICNS,
JXL et HEIF bouclent indéfiniment sur une image malformée. Toutes les versions publiées
sont touchées (`<= 2.0.2`), et **il n'y en a aucune après 2.0.2** — dernière publication en
avril 2025. Il n'y a rien à mettre à jour.

Ce paquet arrive par `expo > @expo/metro > metro > image-size`, c'est-à-dire par le
**bundler**. Il ne s'exécute qu'à la construction, sur la machine qui build, et n'atteint
jamais un téléphone : le `.app` n'embarque que le bundle JS produit, pas les outils qui
l'ont produit. Vérifié sur le bundle livré de 2,9 Mo — zéro occurrence de `image-size`,
zéro de `metro`.

Le scénario d'attaque demanderait de faire analyser au bundler une image fabriquée exprès,
donc de l'avoir d'abord introduite dans les assets du dépôt. La conséquence serait un build
qui ne finit pas. C'est un risque de chaîne d'outils, pas un risque pour les gens qui
installent l'app.

**Décision : on garde.** À revoir si `image-size` publie enfin un correctif, ou si Metro
change de bibliothèque.

## Ne pas lancer `npm audit fix --force` ici

Sur `apps/mobile`, `--force` propose de casser les versions épinglées par Expo SDK 57. Les
versions d'`expo-*` sont solidaires du SDK ; les décaler à la main donne une app qui ne
compile plus, pour refermer des alertes qui ne concernent que le poste de développement.

## Portfolio

Traité le même jour, à zéro : `nanoid` en `3.3.18` par override (il venait de `postcss`,
lui-même déjà épinglé) et `brace-expansion` en `5.0.9` par `npm audit fix`. Les deux ne
tournent qu'à la construction.
