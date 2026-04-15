import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(() => {
    return !sessionStorage.getItem(AUTH_INTRO_KEY);
  });
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
    sessionStorage.setItem(AUTH_INTRO_KEY, "1");
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
          <img src={logoSrc} alt="Fyrescribe" className="h-8" />
          <p className="text-muted-foreground text-sm italic font-['EB_Garamond']">
            Your world. Your words. Your lore.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4 bg-card border border-border rounded-xl p-6">
          <h2 className="text-foreground text-lg font-semibold text-center font-['Cinzel']">
            {isSignUp ? "Create Account" : "Welcome Back"}
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

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-muted-foreground text-xs">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={loading || googleLoading}
            onClick={async () => {
              setError(null);
              setGoogleLoading(true);
              try {
                const result = await lovable.auth.signInWithOAuth("google", {
                  redirect_uri: window.location.origin,
                });
                if (result.error) {
                  setError(result.error.message || "Google sign-in failed");
                }
                if (result.redirected) return;
              } catch (err: any) {
                setError(err.message);
              } finally {
                setGoogleLoading(false);
              }
            }}
            className="w-full"
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            {googleLoading ? "Please wait…" : "Continue with Google"}
          </Button>

          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
            className="text-muted-foreground text-sm hover:text-foreground transition-colors text-center"
          >
            {isSignUp ? "Already have an account? Log in" : "Don't have an account? Sign up"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthPage;
