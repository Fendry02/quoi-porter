// Le moteur de valise reste à la racine du dépôt, où le site web pourra s'en
// servir aussi. Metro surveille déjà le workspace parent (voir metro.config.js).
export { applyPacked, buildTrip, isTrip, prunePacked, quantityFor } from '../../../../js/packing.js';
export { describePacking } from '../../../../js/phrasing.js';
