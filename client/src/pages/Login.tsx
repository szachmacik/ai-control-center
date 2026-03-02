import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Terminal, Zap, Shield } from "lucide-react";

let supabaseClient: ReturnType<typeof createClient> | null = null;

async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const res = await fetch("/api/auth/supabase-config");
  if (!res.ok) throw new Error("Supabase config unavailable");
  const { url, anonKey } = await res.json();
  supabaseClient = createClient(url, anonKey);
  return supabaseClient;
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [checkingCallback, setCheckingCallback] = useState(false);
  const utils = trpc.useUtils();

  // Handle magic link callback (hash fragment from Supabase)
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;

    setCheckingCallback(true);
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get("access_token");
    if (!accessToken) {
      setCheckingCallback(false);
      return;
    }

    fetch("/api/auth/supabase-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
    })
      .then(async (res) => {
        if (res.ok) {
          window.history.replaceState(null, "", window.location.pathname);
          await utils.auth.me.invalidate();
          window.location.href = "/";
        } else {
          const data = await res.json();
          toast.error(data.error ?? "Authentication failed");
          setCheckingCallback(false);
        }
      })
      .catch(() => {
        toast.error("Authentication failed");
        setCheckingCallback(false);
      });
  }, []);

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (error) throw error;
      setSent(true);
      toast.success("Magic link sent — check your inbox");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send magic link");
    } finally {
      setLoading(false);
    }
  };

  if (checkingCallback) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Authenticating…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 border-r border-border relative overflow-hidden">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(oklch(0.92 0.008 265) 1px, transparent 1px),
              linear-gradient(90deg, oklch(0.92 0.008 265) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />
        {/* Glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">AI Control Center</span>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-foreground leading-tight">
              Command your<br />
              <span className="text-primary">AI infrastructure</span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed max-w-sm">
              Manage agents, deploy projects, monitor infrastructure — all from one elegant control panel.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { icon: Zap, label: "Autonomous agent orchestration" },
              { icon: Shield, label: "Secure secrets vault" },
              { icon: Terminal, label: "One-click project deployment" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3 h-3 text-primary" />
                </div>
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-xs text-muted-foreground/50">
          © 2026 AI Control Center
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground">AI Control Center</span>
          </div>

          {!sent ? (
            <>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Sign in</h2>
                <p className="text-muted-foreground text-sm">
                  Enter your email to receive a magic link
                </p>
              </div>

              <form onSubmit={handleSendLink} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-foreground">
                    Email address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="bg-input border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={loading || !email.trim()}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Send magic link"
                  )}
                </Button>
              </form>

              <p className="text-xs text-muted-foreground text-center">
                Access is restricted to authorized users only.
              </p>
            </>
          ) : (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                <Zap className="w-7 h-7 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Check your inbox</h2>
                <p className="text-muted-foreground text-sm">
                  We sent a magic link to <span className="text-foreground font-medium">{email}</span>
                </p>
              </div>
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setSent(false)}
              >
                Use a different email
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
