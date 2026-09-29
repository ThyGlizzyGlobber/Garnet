import type { ComponentProps } from 'react';

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function Icon({ name, ...props }: { name: string } & ComponentProps<'svg'>) {
  switch (name) {
    case 'landmark':
      return (
        <svg {...base} {...props}>
          <path d="M3 21h18M4 10h16M12 3 4 7v3h16V7l-8-4zM6 10v8M10 10v8M14 10v8M18 10v8M4 18h16" />
        </svg>
      );
    case 'building':
      return (
        <svg {...base} {...props}>
          <rect x="5" y="3" width="14" height="18" rx="1.5" />
          <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...base} {...props}>
          <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'phone':
      return (
        <svg {...base} {...props}>
          <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
          <path d="M11 18.5h2" />
        </svg>
      );
    case 'car':
      return (
        <svg {...base} {...props}>
          <path d="M5 17H3v-4l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v4h-2M9 17h6" />
          <path d="M4 12h16" />
          <circle cx="7" cy="17" r="2" />
          <circle cx="17" cy="17" r="2" />
        </svg>
      );
    case 'play':
      return (
        <svg {...base} {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="m10 9 5 3-5 3V9z" />
        </svg>
      );
    case 'pin':
      return (
        <svg {...base} {...props}>
          <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case 'mail':
      return (
        <svg {...base} {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...base} {...props}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    case 'sun':
      return (
        <svg {...base} {...props}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
    case 'download':
      return (
        <svg {...base} {...props}>
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
      );
    case 'home':
      return (
        <svg {...base} {...props}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case 'receipt':
      return (
        <svg {...base} {...props}>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
          <path d="M9 8h6M9 12h6" />
        </svg>
      );
    case 'bolt':
      return (
        <svg {...base} {...props}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </svg>
      );
    case 'people':
      return (
        <svg {...base} {...props}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M16 15.5a5 5 0 0 1 5.5 4.5" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...base} {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      );
    case 'wifi':
      return (
        <svg {...base} {...props}>
          <path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0" />
          <circle cx="12" cy="19" r="1" fill="currentColor" />
        </svg>
      );
    case 'flame':
      return (
        <svg {...base} {...props}>
          <path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-2 3-3 3 0-3-1-6-4-9 0 4-5 6-5 12 0 4 4 8 8 8z" />
        </svg>
      );
    case 'drop':
      return (
        <svg {...base} {...props}>
          <path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z" />
        </svg>
      );
    case 'ledger':
      return (
        <svg {...base} {...props}>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="M3 10h18M8 15h3" />
        </svg>
      );
    case 'wall':
      return (
        <svg {...base} {...props}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case 'inbox':
      return (
        <svg {...base} {...props}>
          <path d="M3 13l2.5-8h13L21 13v6H3z" />
          <path d="M3 13h5l1.5 2.5h5L16 13h5" />
        </svg>
      );
    case 'search':
      return (
        <svg {...base} {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      );
    case 'sparkle':
      return (
        <svg {...base} {...props}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...base} {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'check':
      return (
        <svg {...base} {...props}>
          <path d="m5 12 5 5L20 7" />
        </svg>
      );
    default:
      return (
        <svg {...base} {...props}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
        </svg>
      );
  }
}
