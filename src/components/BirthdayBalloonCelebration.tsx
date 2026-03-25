import React, { useEffect, useMemo, useState } from 'react';
import { BirthdayBalloons } from './BirthdayBalloons';

interface BirthdayBalloonCelebrationProps {
  durationMs?: number;
}

const BALLOON_GROUPS = [
  { left: '4%', delay: '0s', duration: '6.8s', size: '84px', opacity: 0.92, scale: 0.95 },
  { left: '16%', delay: '0.9s', duration: '7.4s', size: '78px', opacity: 0.78, scale: 0.82 },
  { left: '29%', delay: '0.35s', duration: '6.1s', size: '92px', opacity: 0.9, scale: 1 },
  { left: '46%', delay: '1.25s', duration: '7.8s', size: '86px', opacity: 0.8, scale: 0.9 },
  { left: '61%', delay: '0.15s', duration: '6.5s', size: '80px', opacity: 0.88, scale: 0.86 },
  { left: '76%', delay: '1.05s', duration: '7.2s', size: '90px', opacity: 0.76, scale: 0.96 },
  { left: '89%', delay: '0.55s', duration: '6.9s', size: '74px', opacity: 0.72, scale: 0.78 }
];

export const BirthdayBalloonCelebration: React.FC<BirthdayBalloonCelebrationProps> = ({
  durationMs = 7600
}) => {
  const [visible, setVisible] = useState(true);
  const celebrationId = useMemo(
    () => `birthday-balloon-celebration-${Math.random().toString(36).slice(2, 8)}`,
    []
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setVisible(false), durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [durationMs]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden motion-reduce:hidden" aria-hidden="true">
      <style>{`
        .${celebrationId}-rise {
          animation-name: ${celebrationId}-rise;
          animation-timing-function: ease-out;
          animation-fill-mode: forwards;
        }

        .${celebrationId}-float {
          animation-name: ${celebrationId}-float;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          transform-origin: center;
        }

        @keyframes ${celebrationId}-rise {
          0% {
            transform: translate3d(0, 120%, 0) scale(0.9);
            opacity: 0;
          }

          12% {
            opacity: 1;
          }

          100% {
            transform: translate3d(0, -118vh, 0) scale(1.03);
            opacity: 0;
          }
        }

        @keyframes ${celebrationId}-float {
          0%, 100% {
            transform: translateX(-10px) rotate(-5deg);
          }

          50% {
            transform: translateX(14px) rotate(6deg);
          }
        }
      `}</style>

      <div className="absolute inset-0 bg-gradient-to-t from-rose-100/20 via-transparent to-transparent" />

      {BALLOON_GROUPS.map((group, index) => (
        <div
          key={`${celebrationId}-${group.left}-${index}`}
          className={`${celebrationId}-rise absolute bottom-[-8rem]`}
          style={{
            left: group.left,
            opacity: group.opacity,
            animationDelay: group.delay,
            animationDuration: group.duration
          }}
        >
          <div
            className={celebrationId + '-float'}
            style={{
              animationDelay: group.delay,
              animationDuration: index % 2 === 0 ? '2.9s' : '3.6s',
              transform: `scale(${group.scale})`
            }}
          >
            <BirthdayBalloons
              className="drop-shadow-[0_10px_20px_rgba(15,23,42,0.08)]"
              style={{ width: group.size, height: `calc(${group.size} * 0.64)` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
