import React, { useId } from 'react';

interface BirthdayBalloonsProps {
  className?: string;
  style?: React.CSSProperties;
}

interface BirthdayBalloonProps {
  className?: string;
  style?: React.CSSProperties;
  tone?: 'rose' | 'amber' | 'blue';
}

export const BirthdayBalloon: React.FC<BirthdayBalloonProps> = ({
  className = '',
  style,
  tone = 'rose'
}) => {
  const gradientId = useId().replace(/:/g, '');
  const palette = {
    rose: {
      start: '#fb7185',
      end: '#e11d48',
      knot: '#fb7185',
      string: '#f9a8d4'
    },
    amber: {
      start: '#fbbf24',
      end: '#f59e0b',
      knot: '#fbbf24',
      string: '#fcd34d'
    },
    blue: {
      start: '#6366f1',
      end: '#2563eb',
      knot: '#6366f1',
      string: '#93c5fd'
    }
  }[tone];

  return (
    <svg
      viewBox="0 0 28 44"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${gradientId}-${tone}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={palette.start} />
          <stop offset="100%" stopColor={palette.end} />
        </linearGradient>
      </defs>

      <path d="M14 1C8.48 1 4 5.48 4 11c0 6.09 4.93 12 10 12s10-5.91 10-12C24 5.48 19.52 1 14 1Z" fill={`url(#${gradientId}-${tone})`} />
      <path d="M14 23l-3.5 3.5h7L14 23Z" fill={palette.knot} />
      <path d="M14 26.5c0 7.02-1.96 12.16-4.4 16.5" fill="none" stroke={palette.string} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10.4" cy="8.2" r="2.2" fill="#fff" fillOpacity="0.28" />
    </svg>
  );
};

export const BirthdayBalloons: React.FC<BirthdayBalloonsProps> = ({ className = '', style }) => {
  const gradientId = useId().replace(/:/g, '');

  return (
    <svg
      viewBox="0 0 88 56"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${gradientId}-rose`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>
        <linearGradient id={`${gradientId}-amber`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id={`${gradientId}-blue`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>

      <g transform="translate(6 6)">
        <g transform="translate(0 8)">
          <path d="M14 0C9.03 0 5 4.03 5 9c0 5.48 4.44 11 9 11s9-5.52 9-11c0-4.97-4.03-9-9-9Z" fill={`url(#${gradientId}-rose)`} />
          <path d="M14 20l-3.5 3.5h7L14 20Z" fill="#fb7185" />
          <path d="M14 23.5c0 6.13-1.86 11.07-3.2 15.5" fill="none" stroke="#f9a8d4" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="10.5" cy="6.5" r="2" fill="#fff" fillOpacity="0.28" />
        </g>

        <g transform="translate(23 0)">
          <path d="M14 0C9.03 0 5 4.03 5 9c0 5.48 4.44 11 9 11s9-5.52 9-11c0-4.97-4.03-9-9-9Z" fill={`url(#${gradientId}-amber)`} />
          <path d="M14 20l-3.5 3.5h7L14 20Z" fill="#fbbf24" />
          <path d="M14 23.5c.95 4.92 1.23 8.92.6 15.5" fill="none" stroke="#fcd34d" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="10.5" cy="6.5" r="2" fill="#fff" fillOpacity="0.28" />
        </g>

        <g transform="translate(47 6)">
          <path d="M14 0C9.03 0 5 4.03 5 9c0 5.48 4.44 11 9 11s9-5.52 9-11c0-4.97-4.03-9-9-9Z" fill={`url(#${gradientId}-blue)`} />
          <path d="M14 20l-3.5 3.5h7L14 20Z" fill="#6366f1" />
          <path d="M14 23.5c1.46 5.14 2.66 9.03 5.4 15.5" fill="none" stroke="#93c5fd" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="10.5" cy="6.5" r="2" fill="#fff" fillOpacity="0.28" />
        </g>
      </g>
    </svg>
  );
};
