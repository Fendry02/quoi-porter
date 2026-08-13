const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Le moteur météo reste à la racine du dépôt, où le site web l'utilise aussi.
// Metro doit donc surveiller le workspace parent en plus de l'application.
config.watchFolders = [path.resolve(__dirname, '../..')];

module.exports = config;
