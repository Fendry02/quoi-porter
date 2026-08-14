export { fetchForecast, geocode, WeatherError } from '../../../../js/weather.js';
export { buildWeek, widgetSnapshot } from '../../../../js/mobile.js';
// Le libellé de condition n'est plus affiché : le ciel animé montre déjà la
// météo, et un mot qui répète le décor est du bruit. La fonction reste dans le
// module partagé, où le web s'en sert.
export { weatherPalette } from '../../../../js/mobile-presentation.js';
