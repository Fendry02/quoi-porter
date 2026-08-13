export type Place = {
  name: string;
  latitude: number;
  longitude: number;
};

export type WidgetData = {
  place: string;
  outfit: string;
  temperature: string;
  attention: string | null;
};

export type ForecastDay = {
  id: string;
  isToday: boolean;
  label: string;
  weather: {
    tempMin: number;
    tempMax: number;
    feelsLikeMin: number;
    feelsLikeMax: number;
    precipitationProbability: number;
    windGustsKmh: number;
    uvIndex: number;
    weatherCode: number;
  };
  phrasing: {
    wear: string;
    carry: string | null;
    weather: string;
    confidence: string | null;
    notes: { label: string; text: string; when: string | null }[];
  };
};
