import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logoSrc from "@/assets/fyrescribe_logo_white.svg";

// Individual ember/spark particle
const Ember = ({ delay, x, size, duration }: { delay: number; x: number; size: number; duration: number }) => (
  <motion.div
    className="absolute rounded-full"
    style={{
      width: size,
      height: size,
      left: `${x}%`,
      bottom: 0,
      background: `radial-gradient(circle, 
        hsl(30, 100%, 70%) 0%, 
        hsl(20, 100%, 55%) 40%, 
        hsl(10, 100%, 40%) 70%, 
        transparent 100%)`,
      boxShadow: `0 0 ${size * 2}px ${size}px hsla(25, 100%, 50%, 0.4)`,
    }}
    initial={{ y: 0, opacity: 0, scale: 0 }}
    animate={{
      y: [0, -200 - Math.random() * 300, -500 - Math.random() * 200],
      x: [0, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 200],
      opacity: [0, 1, 0.8, 0],
      scale: [0, 1.2, 0.6, 0],
    }}
    transition={{
      duration,
      delay,
      ease: "easeOut",
      repeat: Infinity,
      repeatDelay: Math.random() * 0.5,
    }}
  />
);

// Smoke puff
const SmokePuff = ({ delay, x }: { delay: number; x: number }) => (
  <motion.div
    className="absolute rounded-full"
    style={{
      width: 80 + Math.random() * 60,
      height: 80 + Math.random() * 60,
      left: `${x}%`,
      bottom: "20%",
      background: `radial-gradient(circle, 
        hsla(0, 0%, 60%, 0.15) 0%, 
        hsla(0, 0%, 40%, 0.08) 50%, 
        transparent 100%)`,
      filter: "blur(20px)",
    }}
    initial={{ y: 0, opacity: 0, scale: 0.3 }}
    animate={{
      y: [0, -150, -350],
      x: [(Math.random() - 0.5) * 40, (Math.random() - 0.5) * 100],
      opacity: [0, 0.4, 0.2, 0],
      scale: [0.3, 1.5, 2.5],
    }}
    transition={{
      duration: 3 + Math.random() * 2,
      delay,
      ease: "easeOut",
      repeat: Infinity,
      repeatDelay: Math.random() * 1,
    }}
  />
);

// Fire glow at the base
const FireGlow = () => (
  <motion.div
    className="absolute left-1/2 -translate-x-1/2"
    style={{
      bottom: "10%",
      width: 400,
      height: 200,
      background: `radial-gradient(ellipse at center bottom, 
        hsla(25, 100%, 50%, 0.3) 0%, 
        hsla(15, 100%, 40%, 0.15) 30%, 
        hsla(5, 100%, 30%, 0.08) 50%, 
        transparent 70%)`,
      filter: "blur(30px)",
    }}
    animate={{
      opacity: [0.6, 1, 0.7, 0.9],
      scale: [1, 1.1, 0.95, 1.05],
    }}
    transition={{
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut",
    }}
  />
);

interface FireIntroProps {
  onComplete: () => void;
}

const INTRO_DURATION = 4000; // ms before we start fading out

const FireIntro = ({ onComplete }: FireIntroProps) => {
  const [phase, setPhase] = useState<"playing" | "fading">("playing");

  // Generate particles once
  const embers = useMemo(
    () =>
      Array.from({ length: 35 }, (_, i) => ({
        id: i,
        delay: Math.random() * 1.5,
        x: 30 + Math.random() * 40,
        size: 3 + Math.random() * 6,
        duration: 1.5 + Math.random() * 1.5,
      })),
    []
  );

  const smokePuffs = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        id: i,
        delay: Math.random() * 2,
        x: 35 + Math.random() * 30,
      })),
    []
  );

  useEffect(() => {
    const timer = setTimeout(() => setPhase("fading"), INTRO_DURATION);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {phase === "playing" && (
        <motion.div
          key="fire-intro"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
          style={{ backgroundColor: "#0a0c12" }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
        >
          {/* Particles layer */}
          <div className="absolute inset-0 pointer-events-none">
            <FireGlow />
            {smokePuffs.map((p) => (
              <SmokePuff key={`smoke-${p.id}`} delay={p.delay} x={p.x} />
            ))}
            {embers.map((e) => (
              <Ember key={`ember-${e.id}`} delay={e.delay} x={e.x} size={e.size} duration={e.duration} />
            ))}
          </div>

          {/* Logo reveal */}
          <motion.div
            className="relative z-10 flex flex-col items-center gap-4"
            initial={{ opacity: 0, scale: 0.8, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1.5, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Glow behind logo */}
            <motion.div
              className="absolute inset-0 -m-16"
              style={{
                background: `radial-gradient(circle, 
                  hsla(30, 80%, 50%, 0.2) 0%, 
                  hsla(20, 80%, 40%, 0.1) 40%, 
                  transparent 70%)`,
                filter: "blur(40px)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.8, 0.5, 0.7] }}
              transition={{ duration: 2, delay: 1, ease: "easeOut" }}
            />

            <motion.img
              src={logoSrc}
              alt="Fyrescribe"
              className="h-12 md:h-16 relative z-10"
              style={{
                filter: "drop-shadow(0 0 20px hsla(30, 100%, 50%, 0.5)) drop-shadow(0 0 40px hsla(20, 100%, 40%, 0.3))",
              }}
              initial={{ opacity: 0, filter: "blur(8px) drop-shadow(0 0 20px hsla(30, 100%, 50%, 0.5))" }}
              animate={{ opacity: 1, filter: "blur(0px) drop-shadow(0 0 20px hsla(30, 100%, 50%, 0.5)) drop-shadow(0 0 40px hsla(20, 100%, 40%, 0.3))" }}
              transition={{ duration: 1.2, delay: 1, ease: "easeOut" }}
            />

            <motion.p
              className="text-muted-foreground text-sm italic font-['EB_Garamond'] relative z-10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 2, ease: "easeOut" }}
            >
              Your world. Your words. Your lore.
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FireIntro;
