import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import logoSrc from "@/assets/fyrescribe_logo_white.svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

const AuthPage = () => {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  if (authLoading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0a0c12" }}>
      <div className="w-full max-w-sm flex flex-col items-center gap-8 px-4">
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

          <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
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
      </div>
    </div>
  );
};

export default AuthPage;
