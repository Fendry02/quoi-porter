# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

Existing web application in HTML, CSS, and native ES modules. The mobile application will use Expo, React Native, and Expo Router; the recommendation engine remains shared, framework-independent JavaScript.

## Users

People choosing what to wear before leaving home. They need a reliable answer in a few seconds, then a way to scan the coming week when they are planning ahead.

## Product Purpose

Answer “What should I wear?” from a place-specific weather forecast. Success is a complete, understandable recommendation for today at a glance, with the next seven days accessible without turning weather data into an information dashboard.

## Positioning

The app turns weather into a complete outfit — clothes, outer layer, shoes, and what to carry — instead of merely reporting conditions. It exposes uncertainty only when it could change the recommendation.

## Operating Context

The main use is a quick morning check on a phone. A home-screen widget provides the same immediate answer when the app is closed. A seven-day horizontal forecast supports short-term planning.

## Capabilities and Constraints

- iPhone and Android are both first-class targets.
- V1 includes the seven-day mobile app and a minimal, reliable “Today” widget.
- Forecasts come from Open-Meteo without a user account, server, or API secret.
- Current place is found with device location or city search and remembered locally.
- The existing web version remains available during the mobile migration.
- Native widgets have platform-specific implementations and refresh limits; their content remains intentionally compact.

## Brand Commitments

The product is French-speaking, direct, calm, and close to a helpful friend. The full outfit comes before explanatory weather details. Measurements are factual; advice is human.

## Evidence on Hand

- Existing runnable web experience: `index.html`, `styles.css`, and `js/`.
- Pure, tested weather, outfit, phrasing, uncertainty, and hourly timeline modules in `js/`.
- Visual previews in `media/apercu-beau-temps.jpg` and `media/apercu-pluie.jpg`.
- No user research, brand kit, store listing assets, or personal wardrobe data are currently provided.

## Product Principles

1. Give the outfit before the weather explanation.
2. Make immediate use effortless; keep deeper detail optional.
3. Use the felt temperature and practical risks, not raw data alone.
4. Earn trust by revealing forecast uncertainty only when it matters.
5. Keep the experience useful without an account or manual setup.

## Accessibility & Inclusion

Recommendations remain written, not icon-only. Mobile controls must be reachable by assistive technology, respect system text scaling, and keep sufficient contrast in every weather state.
