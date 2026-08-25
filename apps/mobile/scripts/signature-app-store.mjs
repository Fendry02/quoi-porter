/**
 * Archive et signe l'app pour l'App Store, sans cloud signing.
 *
 * `xcodebuild -allowProvisioningUpdates` avec la clé App Store Connect échoue en
 * « Cloud signing permission error » : la clé peut lire les certificats et les
 * profils, pas s'en servir pour signer. Le contournement est de signer à la main,
 * avec le certificat de distribution du trousseau et les deux profils déjà
 * fabriqués par l'API — l'app et l'extension widget ont chacune le leur.
 *
 * `/ios` étant généré (Expo CNG) et gitignoré, `prebuild` efface ces réglages à
 * chaque passage. D'où ce script : il les repose, puis archive et exporte.
 *
 * Usage :
 *   node scripts/signature-app-store.mjs            # réglages + archive + export
 *   node scripts/signature-app-store.mjs --reglages # réglages seuls
 *
 * L'IPA sort dans `ios/build-appstore/`. La montée sur App Store Connect reste
 * une commande à part, à lancer en connaissance de cause :
 *   xcrun altool --upload-app -f <ipa> -t ios \
 *     --apiKey C9Y9B2RFPK --apiIssuer "$(cat ~/.appstoreconnect/issuer-id)"
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import xcode from 'xcode';

const MOBILE = dirname(dirname(fileURLToPath(import.meta.url)));
const IOS = join(MOBILE, 'ios');
const PBXPROJ = join(IOS, 'QuoiPorter.xcodeproj', 'project.pbxproj');

const EQUIPE = 'K2LUP8LQQY';
/** Créé par l'API en `IOS_DISTRIBUTION`, donc nommé « iPhone Distribution » et pas « Apple ». */
const CERTIFICAT = 'iPhone Distribution';

/** Un profil par bundle id : l'extension widget ne peut pas passer par celui de l'app. */
const PROFILS = {
  'com.weatherclothes.app': 'QuoiPorter AppStore',
  'com.weatherclothes.app.ExpoWidgetsTarget': 'QuoiPorter Widget AppStore',
};

function poserLesReglages() {
  const projet = xcode.project(PBXPROJ);
  projet.parseSync();

  const configs = projet.pbxXCBuildConfigurationSection();
  let posés = 0;

  for (const clé of Object.keys(configs)) {
    const config = configs[clé];
    if (typeof config !== 'object' || !config.buildSettings) continue;
    if (config.name !== 'Release') continue;

    const bundle = config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER;
    const profil = PROFILS[bundle];
    if (!profil) continue;

    Object.assign(config.buildSettings, {
      CODE_SIGN_STYLE: 'Manual',
      DEVELOPMENT_TEAM: EQUIPE,
      PROVISIONING_PROFILE_SPECIFIER: `"${profil}"`,
      CODE_SIGN_IDENTITY: `"${CERTIFICAT}"`,
      // La clé conditionnelle porte ses guillemets dans le pbxproj, comme celle
      // que pose le prebuild (`"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "iPhone Developer"`).
      '"CODE_SIGN_IDENTITY[sdk=iphoneos*]"': `"${CERTIFICAT}"`,
    });

    console.log(`signature manuelle — ${bundle} → ${profil}`);
    posés += 1;
  }

  if (posés !== Object.keys(PROFILS).length) {
    throw new Error(
      `${posés} cible(s) réglée(s) sur ${Object.keys(PROFILS).length} attendues. ` +
        'Le projet a-t-il bien été prebuild, widget compris ?',
    );
  }

  writeFileSync(PBXPROJ, projet.writeSync());
}

function versionDuBundle() {
  const { expo } = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8'));
  return { version: expo.version, build: expo.ios.buildNumber };
}

function lancer(commande, args, options = {}) {
  console.log(`\n$ ${commande} ${args.join(' ')}\n`);
  const { status } = spawnSync(commande, args, { cwd: MOBILE, stdio: 'inherit', ...options });
  if (status !== 0) throw new Error(`${commande} a rendu ${status}`);
}

function archiverEtExporter() {
  const { version, build } = versionDuBundle();
  const sortie = join(IOS, 'build-appstore');
  const archive = join(sortie, `QuoiPorter-${version}-${build}.xcarchive`);
  mkdirSync(sortie, { recursive: true });

  lancer('xcodebuild', [
    '-workspace', join(IOS, 'QuoiPorter.xcworkspace'),
    '-scheme', 'QuoiPorter',
    '-configuration', 'Release',
    '-destination', 'generic/platform=iOS',
    '-archivePath', archive,
    '-derivedDataPath', join(sortie, 'derived'),
    'archive',
  ]);

  const options = join(sortie, 'ExportOptions.plist');
  const profils = Object.entries(PROFILS)
    .map(([bundle, profil]) => `    <key>${bundle}</key>\n    <string>${profil}</string>`)
    .join('\n');

  writeFileSync(
    options,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>${EQUIPE}</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>signingCertificate</key>
  <string>${CERTIFICAT}</string>
  <key>provisioningProfiles</key>
  <dict>
${profils}
  </dict>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
`,
  );

  lancer('xcodebuild', [
    '-exportArchive',
    '-archivePath', archive,
    '-exportOptionsPlist', options,
    '-exportPath', join(sortie, `export-${version}-${build}`),
  ]);

  console.log(`\nIPA : ${join(sortie, `export-${version}-${build}`)}`);
}

poserLesReglages();
if (!process.argv.includes('--reglages')) archiverEtExporter();
