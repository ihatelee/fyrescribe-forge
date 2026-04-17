import { Monitor } from "lucide-react";

interface MobileUnavailableProps {
  feature: string;
}

/**
 * Renders a "desktop only" message on viewports narrower than `lg` (1024px).
 * The wrapping `lg:hidden` ensures it never affects desktop.
 */
const MobileUnavailable = ({ feature }: MobileUnavailableProps) => (
  <div className="lg:hidden flex flex-col items-center justify-center text-center px-8 py-20 min-h-[60vh]">
    <Monitor size={36} className="text-text-dimmed mb-4 opacity-60" strokeWidth={1.25} />
    <h2 className="font-display text-lg text-foreground mb-2">
      {feature} isn't available on mobile
    </h2>
    <p className="text-text-dimmed text-sm max-w-xs leading-relaxed">
      For the best experience, open Fyrescribe on a tablet in landscape mode or a desktop browser.
    </p>
  </div>
);

export default MobileUnavailable;
