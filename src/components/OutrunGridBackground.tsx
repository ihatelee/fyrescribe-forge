const OutrunGridBackground = () => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-[1]" aria-hidden="true">
      <style>{`
        @keyframes outrun-march {
          from { background-position: center 0; }
          to { background-position: center 80px; }
        }
        .outrun-floor-grid {
          background-image:
            linear-gradient(hsl(var(--gold) / 0.3) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--gold) / 0.3) 1px, transparent 1px);
          background-size: 80px 80px;
          animation: outrun-march 1.2s linear infinite;
        }
      `}</style>

      {/* Horizon glow line */}
      <div
        style={{
          position: "absolute",
          top: "42%",
          left: 0,
          right: 0,
          height: "1px",
          background:
            "linear-gradient(to right, transparent 0%, hsl(var(--gold) / 0.6) 20%, hsl(var(--gold)) 50%, hsl(var(--gold) / 0.6) 80%, transparent 100%)",
          boxShadow: "0 0 24px 6px hsl(var(--gold) / 0.25)",
        }}
      />

      {/* Perspective grid floor */}
      <div
        className="outrun-floor-grid"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "62%",
          transform: "perspective(500px) rotateX(72deg)",
          transformOrigin: "50% 0%",
        }}
      />
    </div>
  );
};

export default OutrunGridBackground;
