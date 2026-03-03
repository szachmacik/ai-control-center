import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  Settings as SettingsIcon,
  User,
  Shield,
  Bell,
  Database,
  Globe,
  Key,
  CheckCircle2,
  Info,
} from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const { user } = useAuth();
  const { data: me } = trpc.auth.me.useQuery();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and system configuration</p>
      </div>

      {/* Profile */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Profile</CardTitle>
              <CardDescription className="text-xs">Your account information</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                value={me?.name ?? ""}
                readOnly
                className="bg-muted/20 border-border text-foreground text-sm h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input
                value={me?.email ?? ""}
                readOnly
                className="bg-muted/20 border-border text-foreground text-sm h-9"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Badge
              variant="outline"
              className={
                me?.role === "admin"
                  ? "bg-primary/10 text-primary border-primary/25 text-[10px]"
                  : "bg-muted/20 text-muted-foreground border-border text-[10px]"
              }
            >
              {me?.role === "admin" ? "Administrator" : "User"}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              Authenticated via Supabase OTP
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Security</CardTitle>
              <CardDescription className="text-xs">Authentication and access control</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {[
              { label: "OTP Authentication", desc: "6-digit one-time codes via email", enabled: true },
              { label: "Session Cookies", desc: "Secure HttpOnly cookies, 1-year expiry", enabled: true },
              { label: "Role-Based Access Control", desc: "Admin / User separation", enabled: true },
              { label: "TOTP Zero Trust (coming soon)", desc: "TOTP for critical operations", enabled: false },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/10 border border-border/50">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                {item.enabled ? (
                  <CheckCircle2 className="w-4 h-4 text-[oklch(0.62_0.17_145)]" />
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">
                    Planned
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* System */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Database className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">System</CardTitle>
              <CardDescription className="text-xs">Infrastructure and deployment configuration</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { label: "Hosting", value: "Coolify / DigitalOcean", icon: Globe },
              { label: "Database", value: "MySQL (ai-control-center-db)", icon: Database },
              { label: "Auth Provider", value: "Supabase (qhscjlf...)", icon: Key },
              { label: "Domain", value: "ai-control-center.ofshore.dev", icon: Globe },
            ].map((item) => (
              <div key={item.label} className="bg-muted/10 border border-border/50 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground mb-1">{item.label}</p>
                <p className="text-xs text-foreground font-mono">{item.value}</p>
              </div>
            ))}
          </div>

          <Separator className="bg-border/50" />

          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/15">
            <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">Autonomous Deployment Pipeline</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                This control center manages AI agents and infrastructure on ofshore.dev.
                Deployments are handled via Coolify API with automated migrations on startup.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Bell className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Notifications</CardTitle>
              <CardDescription className="text-xs">Alert preferences</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "Deployment alerts", desc: "Notify on successful / failed deployments" },
            { label: "Agent errors", desc: "Notify when an agent encounters an error" },
            { label: "Infrastructure alerts", desc: "Notify when a service goes offline" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/10 border border-border/50">
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => toast.info("Notification settings coming soon")}
              >
                Configure
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
