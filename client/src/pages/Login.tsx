import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Terminal, Zap, Shield, Mail, KeyRound, ArrowLeft } from "lucide-react";

let supabaseClient: ReturnType<typeof createClient> | null = null;

async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const res = await fetch("/api/auth/supabase-config");
  if (!res.ok) throw new Error("Supabase config unavailable");
  const { url, anonKey } = await res.json();
  supabaseClient = createClient(url, anonKey);
  return supabaseClient;
}

type Step = "email" | "otp";

export default function Login() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const utils = trpc.useUtils();

  const exchangeToken = trpc.auth.exchangeSupabaseToken.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error("Authentication failed: " + err.message);
      setLoading(false);
    },
  });

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep("otp");
      toast.success("Code sent — check your inbox");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) return;
    setLoading(true);
    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: "email",
      });
      if (error) throw error;
      const accessToken = data.session?.access_token;
      const refreshToken = data.session?.refresh_token ?? "";
      if (!accessToken) throw new Error("No access token received");
      await exchangeToken.mutateAsync({ accessToken, refreshToken });
    } catch (err: any) {
      toast.error(err.message ?? "Invalid code");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 border-r border-border relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(oklch(0.92 0.008 265) 1px, transparent 1px),
              linear-gradient(90deg, oklch(0.92 0.008 265) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />
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

          {step === "email" ? (
            <>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Sign in</h2>
                <p className="text-muted-foreground text-sm">
                  Enter your email to receive a one-time code
                </p>
              </div>

              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-foreground">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      className="pl-9 bg-input border-border text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !email.trim()}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</>
                  ) : (
                    "Send code"
                  )}
                </Button>
              </form>

              <p className="text-xs text-muted-foreground text-center">
                Access is restricted to authorized users only.
              </p>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <button
                  onClick={() => { setStep("email"); setOtp(""); }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
                >
                  <ArrowLeft className="w-3 h-3" /> Back
                </button>
                <h2 className="text-2xl font-bold text-foreground">Enter code</h2>
                <p className="text-muted-foreground text-sm">
                  We sent a 6-digit code to{" "}
                  <span className="text-foreground font-medium">{email}</span>
                </p>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="otp" className="text-sm font-medium text-foreground">
                    One-time code
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      placeholder="123456"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      maxLength={6}
                      required
                      autoFocus
                      className="pl-9 bg-input border-border text-foreground text-center tracking-[0.4em] text-lg font-mono"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Didn't receive it?{" "}
                    <button
                      type="button"
                      onClick={() => { setStep("email"); setOtp(""); }}
                      className="text-primary hover:underline"
                    >
                      Resend
                    </button>
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || otp.length < 6}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying…</>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
