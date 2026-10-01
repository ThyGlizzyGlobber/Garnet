import type { ComponentProps } from 'react';

/**
 * Stroke icons, 24 × 24, round caps and joins, 1.9 px (the .ic class). The
 * drawings are the studio's (js/icons.js) plus the service-type icons; each
 * is a path's d attribute, or inner SVG markup when it needs more than one
 * shape. No sparkles or "magic" marks anywhere (BRAND.md rule 1).
 */
const ICONS: Record<string, string> = {
  home: 'M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6.5H9V21H4.5a1 1 0 0 1-1-1z',
  services:
    '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="3.5"/>',
  bills: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3',
  money:
    '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1.1 1.7 2.8 2.1 2.8.9 2.8 2.1-1.2 2-2.8 2c-1.3 0-2.4-.6-2.9-1.5M12 6.3v1.5M12 16.8v1"/>',
  inbox: 'M3 13.5 6 5h12l3 8.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z M3 13.5h5l1.2 2.5h5.6l1.2-2.5h5',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  x: 'M6.5 6.5l11 11 M17.5 6.5l-11 11',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'chevron-left': 'M14.5 5.5 8 12l6.5 6.5',
  'chevron-right': 'M9.5 5.5 16 12l-6.5 6.5',
  'chevron-down': 'M5.5 9.5 12 16l6.5-6.5',
  'chevron-up': 'M5.5 14.5 12 8l6.5 6.5',
  pencil: 'M4 20h4.2L19 9.2 14.8 5 4 15.8z M13.2 6.6l4.2 4.2',
  bolt: 'M13 2.5 4.5 13.5H11L10 21.5l8.5-11H12z',
  flame:
    'M12 3c1.2 3.2 5 5.2 5 10.2a5 5 0 0 1-10 0c0-2.2 1-3.7 2.1-4.7.1 1.9 1 3 2.1 3.1-.2-3.1-.9-5.3.8-8.6z',
  drop: 'M12 3.5c3.2 4.1 6 7.3 6 10.6a6 6 0 0 1-12 0c0-3.3 2.8-6.5 6-10.6z',
  wifi: '<path d="M2.8 9.2a13.5 13.5 0 0 1 18.4 0M5.9 12.6a9 9 0 0 1 12.2 0M9 16a4.6 4.6 0 0 1 6 0"/><circle cx="12" cy="19.2" r="1.1" fill="currentColor" stroke="none"/>',
  landmark: 'M3.5 20.5h17 M5.5 17.5v-7 M10 17.5v-7 M14 17.5v-7 M18.5 17.5v-7 M3.5 10.5h17L12 4z',
  car: '<path d="M4 16.5V12l2.4-5h11.2L20 12v4.5z M4 12h16"/><circle cx="7.5" cy="16.8" r="1.7"/><circle cx="16.5" cy="16.8" r="1.7"/>',
  file: 'M7 3h7.5L19 7.5V21H7z M14.5 3v4.5H19 M10 12.5h6 M10 16h6',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  photo:
    '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8.5 8.5"/>',
  upload: 'M12 15.5V4 M7 8.5 12 4l5 4.5 M4.5 19.5h15',
  download: 'M12 4v11.5 M7 11l5 4.5 5-4.5 M4.5 19.5h15',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: 'M20 14.2A8 8 0 1 1 9.8 4a6.4 6.4 0 0 0 10.2 10.2z',
  cloud: 'M7.2 18.5h9.9a4.1 4.1 0 0 0 .6-8.2 6 6 0 0 0-11.5 1.6 3.3 3.3 0 0 0 1 6.6z',
  'cloud-sun':
    '<path d="M9.5 6.2a4 4 0 0 1 6.9 2.3M8.2 3.2l.5 1.4M3.6 7.6 5 8.1M4.2 3.9l1.2 1"/><path d="M8.2 20h9a3.7 3.7 0 0 0 .6-7.4 5.4 5.4 0 0 0-10.4 1.4 3 3 0 0 0 .8 6z"/>',
  'cloud-rain':
    '<path d="M7.2 15.5h9.9a4.1 4.1 0 0 0 .6-8.2 6 6 0 0 0-11.5 1.6 3.3 3.3 0 0 0 1 6.6z"/><path d="M8.5 18.5l-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2"/>',
  thermo: 'M10 14.2V5a2 2 0 0 1 4 0v9.2a4 4 0 1 1-4 0z M12 9v7',
  'trend-up': 'M3.5 16.5l6-6 4 4 7-7 M15 7.5h5.5V13',
  'trend-down': 'M3.5 7.5l6 6 4-4 7 7 M15 16.5h5.5V11',
  'arrow-up': 'M12 19V5.5 M6.5 11 12 5.5l5.5 5.5',
  'arrow-down': 'M12 5v13.5 M6.5 13l5.5 5.5 5.5-5.5',
  'arrow-right': 'M5 12h13.5 M13 6.5l5.5 5.5-5.5 5.5',
  'arrow-left': 'M19 12H5.5 M11 6.5 5.5 12l5.5 5.5',
  logout: 'M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10 M15 8l4 4-4 4 M19 12H9.5',
  alert: 'M12 3.8 2.8 19.5h18.4z M12 10v4.2 M12 16.8v.2',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2M12 7.8v.2"/>',
  user: '<circle cx="12" cy="8.2" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  users:
    '<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5a6.3 6.3 0 0 1 12.4 0"/><path d="M15.5 5.5a3.2 3.2 0 0 1 0 6.1M17.5 14.2a6.3 6.3 0 0 1 3.7 5.3"/>',
  sliders:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  share: 'M12 3.5v11 M8 7.5l4-4 4 4 M5.5 12v7a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7',
  more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  split: 'M11 3.5a8.5 8.5 0 1 0 9.5 9.5H11z M14 2.8A7.5 7.5 0 0 1 21.2 10H14z',
  repeat:
    'M4.5 12a7.5 7.5 0 0 1 13-5.1 M19.5 12a7.5 7.5 0 0 1-13 5.1 M17.8 3.2v3.9h-3.9 M6.2 20.8v-3.9h3.9',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  move: 'M12 3v18 M3 12h18 M9.5 5.5 12 3l2.5 2.5 M9.5 18.5 12 21l2.5-2.5 M5.5 9.5 3 12l2.5 2.5 M18.5 9.5 21 12l-2.5 2.5',
  resize: 'M14.5 4H20v5.5 M9.5 20H4v-5.5 M20 4l-6.5 6.5 M4 20l6.5-6.5',
  rotate: 'M19.5 11.5a7.5 7.5 0 1 1-2.2-5.3 M19.5 4v5h-5',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 5.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5"/>',
  pin: '<path d="M12 21s-6.8-6-6.8-11.2a6.8 6.8 0 0 1 13.6 0C18.8 15 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/>',
  bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0',
  list: 'M8.5 6.5h12 M8.5 12h12 M8.5 17.5h12 M4 6.5h.5 M4 12h.5 M4 17.5h.5',
  chart: 'M4 20.5V4 M4 20.5h16.5 M8 16.5v-4 M12 16.5V8 M16 16.5v-6',
  layers: 'M12 3.5 3 8l9 4.5L21 8z M3 12.5l9 4.5 9-4.5 M3 16.5l9 4.5 9-4.5',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/>',
  desktop: '<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  devices:
    '<rect x="2.5" y="5" width="13" height="10" rx="1.5"/><path d="M6 18.5h6"/><rect x="17" y="8.5" width="4.5" height="10" rx="1.2"/>',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  shield: 'M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6z',
  building:
    '<rect x="5" y="3" width="14" height="18" rx="1.5" /> <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" />',
  play: '<rect x="3" y="5" width="18" height="14" rx="2.5" /> <path d="m10 9 5 3-5 3V9z" />',
  'car-shield':
    '<path d="M4 15H3v-3.5l1.6-4.3A2 2 0 0 1 6.5 6h7" /> <path d="M3.5 11.5H12" /> <circle cx="6.5" cy="15.5" r="1.8" /> <path d="M18 9.5l-4 1.6v2.8c0 2.4 1.7 4.3 4 5 2.3-.7 4-2.6 4-5v-2.8l-4-1.6z" />',
  'car-wrench':
    '<path d="M4 15H3v-3.5l1.6-4.3A2 2 0 0 1 6.5 6h7" /> <path d="M3.5 11.5H12" /> <circle cx="6.5" cy="15.5" r="1.8" /> <path d="M19.8 9.2a3 3 0 0 1-3.9 3.9l-3.4 3.4a1.3 1.3 0 0 1-1.9-1.9l3.4-3.4a3 3 0 0 1 3.9-3.9l-1.8 1.8.4 1.5 1.5.4 1.8-1.8z" />',
  dumbbell:
    '<path d="M8 12h8" /> <rect x="4.5" y="7" width="3.5" height="10" rx="1" /> <rect x="16" y="7" width="3.5" height="10" rx="1" /> <path d="M2.5 10v4M21.5 10v4" />',
  roadside:
    '<path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" /> <path d="M12 9.5v4.5M12 17.2v.01" />',
  cross: '<path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z" />',
  leaf: '<path d="M5 19c0-8 5-14 15-15-.5 10-6.5 15-14 15" /> <path d="M5 19c3-4 6-7 10-9.5" />',
  spray:
    '<path d="M8 9h6l1 3v8.5a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5V12l1-3zM9 9V6h4v3M13 6h3l2 2" /> <path d="M19.5 4v.01M21 6.5v.01M19.5 9v.01" />',
  bug: '<rect x="8" y="8" width="8" height="12" rx="4" /> <path d="M12 8v12M9.5 8a2.5 2.5 0 0 1 5 0M4 13h4M16 13h4M5 8l3 2M19 8l-3 2M5 19l3-2.5M19 19l-3-2.5" />',
  waves:
    '<path d="M3 9c1.5 0 1.5-1.5 3-1.5S7.5 9 9 9s1.5-1.5 3-1.5S13.5 9 15 9s1.5-1.5 3-1.5S19.5 9 21 9" /> <path d="M3 14c1.5 0 1.5-1.5 3-1.5S7.5 14 9 14s1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5" /> <path d="M3 19c1.5 0 1.5-1.5 3-1.5S7.5 19 9 19s1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5" />',
  wrench:
    '<path d="M14.5 6.5a4 4 0 0 0 5 5l-9 9a2.1 2.1 0 0 1-3-3l9-9a4 4 0 0 1 5-5l-2.5 2.5.5 2 2 .5 2.5-2.5" />',
  heart:
    '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" /> <path d="M7.5 12h2.5l1.2-2 1.6 4 1.2-2h2.5" />',
  sofa: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" /> <path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4zM6 18v2M18 18v2" />',
  'house-shield':
    '<path d="M3 11 12 4l9 7" /> <path d="M5.5 9.5V20h13V9.5" /> <path d="M12 11.5l-3 1.2v2.1c0 1.8 1.3 3.2 3 3.7 1.7-.5 3-1.9 3-3.7v-2.1l-3-1.2z" />',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /> <path d="M9 8h6M9 12h6" />',
  'hand-heart':
    '<path d="M12 11.5S8.5 9.4 8.5 6.9A1.9 1.9 0 0 1 12 5.9a1.9 1.9 0 0 1 3.5 1c0 2.5-3.5 4.6-3.5 4.6z" /> <path d="M3 14.5h3l3.5 1.5h4a1.5 1.5 0 0 1 0 3H9.5M13.5 19l5-2.2a1.5 1.5 0 0 1 1.5 2.5L14 21.5H6.5L3 20" />',
};

/** Names the screens used before the redesign, kept as spellings of the studio's icons. */
const ALIASES: Record<string, string> = {
  people: 'users',
  gear: 'sliders',
  ledger: 'money',
  wall: 'desktop',
};

export const hasIcon = (name: string): boolean => (ALIASES[name] ?? name) in ICONS;

export function Icon({
  name,
  className,
  ...props
}: { name: string } & Omit<ComponentProps<'svg'>, 'children'>) {
  const def = ICONS[ALIASES[name] ?? name] ?? ICONS.info!;
  const inner = def.startsWith('<') ? def : `<path d="${def}"/>`;
  return (
    <svg
      className={className ? `ic ${className}` : 'ic'}
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: inner }}
      {...props}
    />
  );
}
