import { useState } from "react";

const STAR_COUNT = 80;
const SPARKLE_COUNT = 12;
const randomBetween = (a: number, b: number) => Math.random() * (b - a) + a;

const StarfieldBackground = () => {
  const [stars] = useState(() =>
    Array.from({ length: STAR_COUNT }, (_, i) => ({
      id: i,
      x: randomBetween(0, 100),
      y: randomBetween(0, 100),
      size: randomBetween(1, 2.5),
      delay: randomBetween(0, 8),
      duration: randomBetween(3, 7),
    }))
  );

  const [sparkles] = useState(() =>
    Array.from({ length: SPARKLE_COUNT }, (_, i) => ({
      id: i,
      x: randomBetween(5, 95),
      y: randomBetween(5, 95),
      delay: randomBetween(0, 12),
      duration: randomBetween(4, 8),
      size: randomBetween(8, 14),
    }))
  );

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-[1]" aria-hidden="true">
      <svg className="absolute inset-0 w-full h-full">
        {stars.map((s) => (
          <circle
            key={s.id}
            cx={`${s.x}%`}
            cy={`${s.y}%`}
            r={s.size}
            fill="currentColor"
            className="text-foreground animate-twinkle"
            style={{
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}
      </svg>
      {sparkles.map((sp) => (
        <span
          key={`sp-${sp.id}`}
          className="absolute animate-sparkle text-foreground/60"
          style={{
            left: `${sp.x}%`,
            top: `${sp.y}%`,
            fontSize: sp.size,
            animationDelay: `${sp.delay}s`,
            animationDuration: `${sp.duration}s`,
          }}
        >
          ✦
        </span>
      ))}
    </div>
  );
};

export default StarfieldBackground;
