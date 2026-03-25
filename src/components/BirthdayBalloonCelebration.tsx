import React, { useEffect, useMemo, useState } from 'react';
import { BirthdayBalloon } from './BirthdayBalloons';

interface BirthdayBalloonCelebrationProps {
  durationMs?: number;
}

const BALLOONS = [
  { left: '4%', delay: '0s', duration: '6.2s', size: '44px', opacity: 0.92, driftStart: '-6px', driftMid: '12px', driftEnd: '-20px', sway: '3.2s', tone: 'rose', scale: 0.92 },
  { left: '10%', delay: '0.4s', duration: '7.1s', size: '36px', opacity: 0.72, driftStart: '8px', driftMid: '-10px', driftEnd: '18px', sway: '2.8s', tone: 'amber', scale: 0.84 },
  { left: '18%', delay: '0.85s', duration: '6.7s', size: '48px', opacity: 0.86, driftStart: '-4px', driftMid: '10px', driftEnd: '-14px', sway: '3.5s', tone: 'blue', scale: 1 },
  { left: '24%', delay: '0.15s', duration: '5.9s', size: '40px', opacity: 0.84, driftStart: '0px', driftMid: '-12px', driftEnd: '20px', sway: '2.9s', tone: 'rose', scale: 0.88 },
  { left: '31%', delay: '1.2s', duration: '7.6s', size: '38px', opacity: 0.66, driftStart: '-8px', driftMid: '6px', driftEnd: '-24px', sway: '3.7s', tone: 'amber', scale: 0.8 },
  { left: '39%', delay: '0.55s', duration: '6.4s', size: '46px', opacity: 0.88, driftStart: '6px', driftMid: '14px', driftEnd: '-10px', sway: '3.1s', tone: 'blue', scale: 0.94 },
  { left: '47%', delay: '1.55s', duration: '7.9s', size: '42px', opacity: 0.76, driftStart: '-10px', driftMid: '8px', driftEnd: '16px', sway: '3.8s', tone: 'rose', scale: 0.9 },
  { left: '54%', delay: '0.25s', duration: '6.1s', size: '50px', opacity: 0.9, driftStart: '4px', driftMid: '-16px', driftEnd: '10px', sway: '3s', tone: 'amber', scale: 1.02 },
  { left: '61%', delay: '1.05s', duration: '6.8s', size: '37px', opacity: 0.7, driftStart: '-2px', driftMid: '12px', driftEnd: '-18px', sway: '2.7s', tone: 'blue', scale: 0.82 },
  { left: '69%', delay: '0.7s', duration: '7.3s', size: '45px', opacity: 0.86, driftStart: '10px', driftMid: '-8px', driftEnd: '22px', sway: '3.3s', tone: 'rose', scale: 0.96 },
  { left: '76%', delay: '1.85s', duration: '6.5s', size: '39px', opacity: 0.74, driftStart: '-6px', driftMid: '14px', driftEnd: '-12px', sway: '3.4s', tone: 'amber', scale: 0.86 },
  { left: '83%', delay: '0.05s', duration: '5.8s', size: '47px', opacity: 0.94, driftStart: '2px', driftMid: '-10px', driftEnd: '18px', sway: '2.6s', tone: 'blue', scale: 1.04 },
  { left: '90%', delay: '1.35s', duration: '7.4s', size: '35px', opacity: 0.68, driftStart: '-8px', driftMid: '6px', driftEnd: '-16px', sway: '3.6s', tone: 'rose', scale: 0.78 },
  { left: '95%', delay: '0.95s', duration: '6.6s', size: '41px', opacity: 0.8, driftStart: '6px', driftMid: '-12px', driftEnd: '12px', sway: '2.95s', tone: 'amber', scale: 0.9 }
] as const;

export const BirthdayBalloonCelebration: React.FC<BirthdayBalloonCelebrationProps> = ({
  durationMs = 8200
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
          animation-timing-function: cubic-bezier(0.18, 0.78, 0.21, 1);
          animation-fill-mode: forwards;
          will-change: transform, opacity;
        }

        .${celebrationId}-float {
          animation-name: ${celebrationId}-float;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          transform-origin: center;
          will-change: transform;
        }

        @keyframes ${celebrationId}-rise {
          0% {
            transform: translate3d(var(--drift-start), 120%, 0) scale(0.88);
            opacity: 0;
          }

          10% {
            opacity: 1;
          }

          55% {
            transform: translate3d(var(--drift-mid), -48vh, 0) scale(1);
            opacity: 1;
          }

          100% {
            transform: translate3d(var(--drift-end), -122vh, 0) scale(1.04);
            opacity: 0;
          }
        }

        @keyframes ${celebrationId}-float {
          0%, 100% {
            transform: translateX(-8px) rotate(-5deg);
          }

          50% {
            transform: translateX(12px) rotate(6deg);
          }
        }
      `}</style>

      <div className="absolute inset-0 bg-gradient-to-t from-rose-100/20 via-transparent to-transparent" />

      {BALLOONS.map((balloon, index) => (
        <div
          key={`${celebrationId}-${balloon.left}-${index}`}
          className={`${celebrationId}-rise absolute bottom-[-8rem]`}
          style={{
            left: balloon.left,
            opacity: balloon.opacity,
            animationDelay: balloon.delay,
            animationDuration: balloon.duration,
            ['--drift-start' as string]: balloon.driftStart,
            ['--drift-mid' as string]: balloon.driftMid,
            ['--drift-end' as string]: balloon.driftEnd
          }}
        >
          <div
            className={celebrationId + '-float'}
            style={{
              animationDelay: balloon.delay,
              animationDuration: balloon.sway,
              transform: `scale(${balloon.scale})`
            }}
          >
            <BirthdayBalloon
              tone={balloon.tone}
              className="drop-shadow-[0_10px_20px_rgba(15,23,42,0.08)]"
              style={{ width: balloon.size, height: `calc(${balloon.size} * 1.57)` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
