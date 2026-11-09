import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import logoSrc from "@/assets/fyrescribe_logo_white.svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import FireIntro from "@/components/FireIntro";

const AUTH_INTRO_KEY = "fyrescribe_intro_seen";

const AuthPage = () => {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showIntro] = useState(true);
  const [introComplete, setIntroComplete] = useState(false);

  useEffect(() => {
    if (!authLoading && session) {
      navigate("/projects", { replace: true });
    }
  }, [session, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (isSignUp) {
        // Check email allowlist before attempting signup
        const { data: isAllowed, error: allowlistError } = await supabase.rpc("is_email_allowed", {
          check_email: email,
        });
        if (allowlistError) throw new Error("Unable to verify email eligibility.");
        if (!isAllowed) throw new Error("Registration is not available for this email address.");

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMessage("Check your email for a confirmation link.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleIntroComplete = () => {
    setIntroComplete(true);
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center relative" style={{ backgroundColor: "#0a0c12" }}>
      {showIntro && !introComplete && <FireIntro onComplete={handleIntroComplete} />}

      <motion.div
        className="w-full max-w-sm flex flex-col items-center gap-8 px-4"
        initial={showIntro ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 }}
        animate={(!showIntro || introComplete) ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
      >
        <div className="flex flex-col items-center gap-3">
          <img src={logoSrc} alt="Fyrescribe" className="h-16" />
          <p className="text-white text-lg font-normal font-['EB_Garamond']">
            Tell us a tale beside the fyre
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4 bg-card border border-border rounded-xl p-6">
          <h2 className="text-foreground text-lg font-semibold text-center font-['Cinzel']">
            {isSignUp ? "Create Account" : "Welcome"}
          </h2>

          {error && (
            <p className="text-destructive text-sm text-center">{error}</p>
          )}
          {message && (
            <p className="text-primary text-sm text-center">{message}</p>
          )}

          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-secondary border-border"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="bg-secondary border-border"
          />

          <Button type="submit" disabled={loading || googleLoading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
            {loading ? "Please wait…" : isSignUp ? "Sign Up" : "Log In"}
          </Button>

          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
            className="text-muted-foreground text-sm hover:text-foreground transition-colors text-center"
          >
            {isSignUp ? "Already have an account? Log in" : "Don't have an account? Sign up"}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default AuthPage;
