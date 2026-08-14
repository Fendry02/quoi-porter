export { fetchForecast, geocode, WeatherError } from '../../../../js/weather.js';
export { buildWeek, widgetSnapshot } from '../../../../js/mobile.js';
// Le libellé de condition n'est plus affiché : le ciel animé montre déjà la
// météo, et un mot qui répète le décor est du bruit. La fonction reste dans le
// module partagé, où le web s'en sert.
export { weatherPalette } from '../../../../js/mobile-presentation.js';
// Le voile de lisibilité se calcule sur les couleurs du ciel : il est partagé
// pour que la garantie de contraste soit vérifiée par la suite de tests, et non
// réglée à l'œil dans l'écran.
export { luminanceOf, veilFor } from '../../../../js/mobile-presentation.js';
