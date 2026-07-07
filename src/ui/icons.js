// Set de íconos SVG del lobby — glifos planos, heredan color vía currentColor.
const svg = (body, viewBox = '0 0 24 24') =>
  `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  // Navegación
  play: svg('<path d="M4.5 12.5 6 8.7A2.5 2.5 0 0 1 8.3 7h7.4A2.5 2.5 0 0 1 18 8.7l1.5 3.8c.9.2 1.5 1 1.5 1.9v3.1a1 1 0 0 1-1 1h-1.2a1 1 0 0 1-1-1v-.5H6.2v.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3.1c0-.9.6-1.7 1.5-1.9zM7 12h10l-1-2.8a1 1 0 0 0-.9-.7H8.9a1 1 0 0 0-.9.7zm.2 3.4a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm9.6 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z"/>'),
  wrench: svg('<path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>'),
  turret: svg('<path d="M3 18h18v2.5H3zM7.5 14h9l1 3h-11zM10 7h4v6h-4zM12.8 3H20v2h-7.2z"/><circle cx="12" cy="5" r="1.6"/>'),
  car: svg('<path d="M5 13l1.3-3.9A2 2 0 0 1 8.2 7.7h7.6a2 2 0 0 1 1.9 1.4L19 13v4.5a1 1 0 0 1-1 1h-.8a1 1 0 0 1-1-1V17H7.8v.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zm2.4-1.6h9.2l-.9-2.6a.8.8 0 0 0-.7-.5H9a.8.8 0 0 0-.7.5zM8 15.4a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2zm8 0a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2z"/>'),
  cart: svg('<path d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7.2 14.8 7.1 15a.2.2 0 0 0 .2.3H19v2H7a2 2 0 0 1-1.8-2.9l1.4-2.4L3 4H1V2h3.3l.9 2H21a1 1 0 0 1 .9 1.4l-3.6 6.5a2 2 0 0 1-1.7 1H8.1z"/>'),
  chest: svg('<path d="M4 5h16a2 2 0 0 1 2 2v3H2V7a2 2 0 0 1 2-2zM2 12h8v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2h8v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1zm9-2h2v3h-2z"/>'),
  calendar: svg('<path d="M7 2h2v3H7zM15 2h2v3h-2zM4 4h1v3h4V4h6v3h4V4h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 7v9h16v-9zm3 2h3v3H7z"/>'),
  missions: svg('<path d="M9 2h6a1 1 0 0 1 1 1v1h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V3a1 1 0 0 1 1-1zm1 2v1h4V4zM7 10l1.8 1.8L12.5 8l1.4 1.4-5.1 5.1L5.6 11zM7 17h10v1.6H7z"/>'),
  gear: svg('<path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7.5 7.5 0 0 0-1.7-1L14.5 2.6a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4L9.2 5.2a7.5 7.5 0 0 0-1.7 1l-2.4-1a.5.5 0 0 0-.6.2L2.6 8.8a.5.5 0 0 0 .1.6l2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.3c.1.2.4.3.6.2l2.4-1c.5.4 1.1.8 1.7 1l.4 2.6c0 .3.3.4.5.4h3.8c.3 0 .5-.2.5-.4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4 1c.2.1.5 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/>'),

  // Recursos
  coin: svg('<circle cx="12" cy="12" r="9.2" fill="#f6c229"/><circle cx="12" cy="12" r="9.2" fill="none" stroke="#b07a12" stroke-width="1.6"/><circle cx="12" cy="12" r="5.4" fill="none" stroke="#b07a12" stroke-width="1.8"/><path d="M11 7.4h2v9.2h-2z" fill="#b07a12"/>'),
  gem: svg('<path d="M7 3h10l4 5.5L12 21 3 8.5z" fill="#4cc3ff"/><path d="M7 3l5 5.5L17 3zM3 8.5h18L12 21z" fill="#8fdcff" opacity=".55"/><path d="M12 8.5 7 3 3 8.5z" fill="#2ea6e6"/>'),
  fuel: svg('<path d="M6 3h7a1 1 0 0 1 1 1v16H5V4a1 1 0 0 1 1-1z" fill="#57c84d"/><path d="M7 5h5v4.6H7z" fill="#123a10"/><path d="M15.5 9.2 18 7v9.4a.9.9 0 0 1-1.8 0v-4.2a1 1 0 0 0-.7-1zM4 20h11v1.6H4z" fill="#57c84d"/>'),
  flame: svg('<path d="M12 2s5.5 4.9 5.5 10a5.5 5.5 0 0 1-11 0c0-2.1 1-4 2.5-5.6 0 1.5.9 2.6 2 2.6C11 6.8 12 2 12 2z" fill="#ff7a1a"/><path d="M12 9s2.6 2.5 2.6 5a2.6 2.6 0 0 1-5.2 0C9.4 11.8 12 9 12 9z" fill="#ffc93d"/>'),

  // Equipamiento
  shield: svg('<path d="M12 2l8 3v6.2c0 4.9-3.4 9.2-8 10.8-4.6-1.6-8-5.9-8-10.8V5z"/><path d="M12 4.2 6 6.4v4.8c0 3.8 2.5 7.2 6 8.6z" fill="#fff" opacity=".18"/>'),
  armor: svg('<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/><path d="M6 6h3v3H6zM15 6h3v3h-3zM6 15h3v3H6zM15 15h3v3h-3z" fill="#fff" opacity=".2"/>'),
  engine: svg('<path d="M7 6h5l2 3h5a1 1 0 0 1 1 1v7h-2.4l-1.6 2H8l-3-3H3v-6h4zm1 4v4h8v-4z"/><path d="M9 2h6v2.5H9z"/>'),
  nitro: svg('<path d="M9 2.5h6V5H9zM8.5 6h7l1.8 3v11a1.5 1.5 0 0 1-1.5 1.5H8.2A1.5 1.5 0 0 1 6.7 20V9z"/><path d="M12 10l-2.4 4h1.9l-.9 3.6L14 13h-1.9l.9-3z" fill="#0b0c10"/>'),
  tire: svg('<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="4.2" fill="#0b0c10"/><circle cx="12" cy="12" r="1.8"/><path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2M5.3 5.3l2.2 2.2M16.5 16.5l2.2 2.2M18.7 5.3l-2.2 2.2M7.5 16.5l-2.2 2.2" stroke="#0b0c10" stroke-width="1.6"/>'),

  // Varios
  stats: svg('<path d="M4 20V10.5h3.4V20zM10.3 20V4h3.4v16zM16.6 20v-6.8H20V20z"/>'),
  lock: svg('<path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10h.8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6.7a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h5V7.5a2.5 2.5 0 0 0-5 0zm2.5 4a1.4 1.4 0 0 0-.7 2.6V18h1.4v-1.4a1.4 1.4 0 0 0-.7-2.6z"/>'),
  plus: svg('<path d="M10.6 4h2.8v6.6H20v2.8h-6.6V20h-2.8v-6.6H4v-2.8h6.6z"/>'),
  avatar: svg('<circle cx="12" cy="8.2" r="4.2"/><path d="M4 20a8 8 0 0 1 16 0z"/>'),
  bolt: svg('<path d="M13 2 4.5 13.5H11L9.5 22 18 10.5h-6.5z"/>'),
  pass: svg('<path d="M12 2l3 2.5L18.7 4l.8 3.7L23 9.5l-1.7 3.4 1.2 3.6-3.5 1.3-1.5 3.5-3.7-.9L10 22l-2.8-2.6-3.7.9L2 16.8l1.7-3.9L2 9.5l3.5-1.8L6.3 4 10 4.5z"/><text x="12" y="15.5" text-anchor="middle" font-size="9" font-weight="bold" fill="#0b0c10" font-family="sans-serif">12</text>'),
  chevronL: svg('<path d="M15 4l-8 8 8 8 1.8-1.8L10.6 12l6.2-6.2z"/>'),
  chevronR: svg('<path d="M9 4l8 8-8 8-1.8-1.8L13.4 12 7.2 5.8z"/>')
};

// Silueta genérica de carro para las cards del carrusel (tinte por vehículo)
export function carSilhouette(color) {
  return `<svg viewBox="0 0 96 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6 32l5-11c.8-1.7 2.5-2.8 4.4-2.8H26l8-8h26l6 8h14c3.3 0 6 2.7 6 6v7.8h-6.2a7.5 7.5 0 0 1-14.6 0H33.8a7.5 7.5 0 0 1-14.6 0H6z" fill="${color}"/>
    <path d="M36 11h13l4.5 6H30z" fill="#0b0c10" opacity=".55"/>
    <circle cx="26.5" cy="33" r="6" fill="#16171c" stroke="${color}" stroke-width="2"/>
    <circle cx="72.5" cy="33" r="6" fill="#16171c" stroke="${color}" stroke-width="2"/>
  </svg>`;
}
