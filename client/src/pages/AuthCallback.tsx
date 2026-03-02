import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { createClient } from "@supabase/supabase-js";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        // Get session from URL hash (magic link sets #access_token=...)
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
          // Try exchanging code from URL params
          const params = new URLSearchParams(window.location.search);
          const code = params.get("code");

          if (code) {
            const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError || !data.session) {
              throw new Error(exchangeError?.message ?? "Failed to exchange code");
            }
          } else {
            throw new Error(error?.message ?? "No session found");
          }
        }

        // Get the final session
        const { data: { session: finalSession } } = await supabase.auth.getSession();
        if (!finalSession) throw new Error("Session not established");

        // Exchange Supabase token for app session cookie
        const res = await fetch("/api/auth/supabase-callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            access_token: finalSession.access_token,
            refresh_token: finalSession.refresh_token,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Server error ${res.status}`);
        }

        setStatus("success");
        setTimeout(() => setLocation("/"), 800);
      } catch (err: any) {
        console.error("[AuthCallback]", err);
        setErrorMsg(err.message ?? "Authentication failed");
        setStatus("error");
        setTimeout(() => setLocation("/login"), 3000);
      }
    };

    handleCallback();
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Signing you in…</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="w-8 h-8 text-[oklch(0.62_0.17_145)] mx-auto" />
            <p className="text-sm text-muted-foreground">Signed in successfully</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-8 h-8 text-destructive mx-auto" />
            <p className="text-sm text-foreground font-medium">Authentication failed</p>
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
            <p className="text-xs text-muted-foreground">Redirecting to login…</p>
          </>
        )}
      </div>
    </div>
  );
}
