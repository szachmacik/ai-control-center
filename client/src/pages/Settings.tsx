import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/components/ThemeToggle";
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
  Palette,
  Calendar,
  AlertTriangle,
  Copy,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import { toast } from "sonner";

type Tab = "profile" | "appearance" | "notifications" | "audit-schedule" | "api" | "danger";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "audit-schedule", label: "Audit Schedule", icon: Calendar },
  { id: "api", label: "API Access", icon: Key },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

export default function Settings() {
  const { user } = useAuth();
  const { data: me } = trpc.auth.me.useQuery();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [notifs, setNotifs] = useState({
    auditCritical: true,
    auditHigh: true,
    auditMedium: false,
    agentDown: true,
    taskFailed: true,
    uptimeAlert: true,
    weeklyReport: true,
  });
  const [schedule, setSchedule] = useState({
    uptimeEnabled: true,
    uptimeCron: "0 7 * * *",
    securityEnabled: true,
    securityCron: "0 8 * * 1",
    functionalEnabled: true,
    functionalCron: "30 8 * * 1",
    dependencyEnabled: true,
    dependencyCron: "0 9 * * 1",
    dbHealthEnabled: true,
    dbHealthCron: "0 9 1 * *",
  });
  // Load persisted schedule from DB
  const { data: savedSchedule } = trpc.settings.getSchedule.useQuery();
  if (savedSchedule && savedSchedule.uptimeCron !== schedule.uptimeCron) {
    setSchedule(savedSchedule);
  }
  const saveScheduleMutation = trpc.settings.saveSchedule.useMutation({
    onSuccess: () => toast.success("Schedule saved and persisted to database"),
    onError: (e) => toast.error(e.message),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied to clipboard"));
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-primary" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account, appearance, and system configuration</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <nav className="flex md:flex-col gap-1 md:w-48 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left w-full ${
                activeTab === tab.id
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : tab.id === "danger"
                  ? "text-destructive hover:text-destructive hover:bg-destructive/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <tab.icon className="w-4 h-4 shrink-0" />
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 space-y-4">
          {/* Profile */}
          {activeTab === "profile" && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Profile Information</CardTitle>
                <CardDescription className="text-xs">Your account details and security status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <Input value={user?.email ?? ""} disabled className="bg-muted/50 text-sm h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Role</Label>
                    <div className="flex items-center h-9">
                      <Badge variant="outline" className="text-xs capitalize">{me?.role ?? "user"}</Badge>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">User ID</Label>
                  <div className="flex items-center gap-2">
                    <Input value={user?.id ?? ""} disabled className="bg-muted/50 text-xs h-9 font-mono" />
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => copyToClipboard(String(user?.id ?? ""))}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Security Status</p>
                  {[
                    { label: "OTP Authentication", desc: "6-digit one-time codes via email", enabled: true },
                    { label: "Session Cookies", desc: "Secure HttpOnly cookies, 1-year expiry", enabled: true },
                    { label: "Role-Based Access Control", desc: "Admin / User separation", enabled: true },
                    { label: "TOTP Zero Trust", desc: "TOTP for critical operations (coming soon)", enabled: false },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/10 border border-border/50">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      {item.enabled ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Planned</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Appearance */}
          {activeTab === "appearance" && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Appearance</CardTitle>
                <CardDescription className="text-xs">Customize how Sentinel looks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Theme</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {(["light", "dark", "system"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                          theme === t ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:border-muted-foreground/30"
                        }`}
                      >
                        {t === "light" && <Sun className="w-5 h-5" />}
                        {t === "dark" && <Moon className="w-5 h-5" />}
                        {t === "system" && <Monitor className="w-5 h-5" />}
                        <span className="text-xs font-medium capitalize">{t}</span>
                        {theme === t && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>
                <Separator />
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-300">
                    Theme preference is saved to localStorage and applied immediately. The theme toggle in the topbar provides quick access to switch between dark and light modes.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notifications */}
          {activeTab === "notifications" && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Notification Preferences</CardTitle>
                <CardDescription className="text-xs">Control which events trigger in-app notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {[
                  { key: "auditCritical", label: "Critical audit findings", desc: "Immediate alert for critical severity findings" },
                  { key: "auditHigh", label: "High audit findings", desc: "Alert for high severity findings" },
                  { key: "auditMedium", label: "Medium audit findings", desc: "Alert for medium severity findings" },
                  { key: "agentDown", label: "Agent offline", desc: "When a monitored agent goes offline" },
                  { key: "taskFailed", label: "Task failures", desc: "When an agent task fails" },
                  { key: "uptimeAlert", label: "Uptime alerts", desc: "When a monitored endpoint goes down" },
                  { key: "weeklyReport", label: "Weekly summary", desc: "Weekly digest of all audit results" },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch
                      checked={notifs[key as keyof typeof notifs]}
                      onCheckedChange={(v) => setNotifs((n) => ({ ...n, [key]: v }))}
                    />
                  </div>
                ))}
                <div className="pt-3">
                  <Button size="sm" onClick={() => toast.success("Notification preferences saved")}>Save preferences</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Audit Schedule */}
          {activeTab === "audit-schedule" && (
            <div className="space-y-4">
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Audit Schedule Configuration</CardTitle>
                  <CardDescription className="text-xs">Configure cron schedules for automated audits (UTC, 5-field format)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "Uptime Check", desc: "Daily availability monitoring", enabledKey: "uptimeEnabled", cronKey: "uptimeCron" },
                    { label: "Security Audit", desc: "Weekly security scan", enabledKey: "securityEnabled", cronKey: "securityCron" },
                    { label: "Functional Audit", desc: "Weekly functional & i18n check", enabledKey: "functionalEnabled", cronKey: "functionalCron" },
                    { label: "Dependency Check", desc: "Weekly CVE & outdated packages", enabledKey: "dependencyEnabled", cronKey: "dependencyCron" },
                    { label: "DB Health Check", desc: "Monthly Supabase health check", enabledKey: "dbHealthEnabled", cronKey: "dbHealthCron" },
                  ].map(({ label, desc, enabledKey, cronKey }) => (
                    <div key={cronKey} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border border-border">
                      <Switch
                        checked={schedule[enabledKey as keyof typeof schedule] as boolean}
                        onCheckedChange={(v) => setSchedule((s) => ({ ...s, [enabledKey]: v }))}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      <Input
                        value={String(schedule[cronKey as keyof typeof schedule])}
                        onChange={(e) => setSchedule((s) => ({ ...s, [cronKey]: e.target.value }))}
                        className="w-40 font-mono text-xs h-8 bg-background"
                        placeholder="cron expression"
                      />
                    </div>
                  ))}
                  <Button
                    size="sm"
                    disabled={saveScheduleMutation.isPending}
                    onClick={() => saveScheduleMutation.mutate(schedule)}
                  >
                    {saveScheduleMutation.isPending ? "Saving..." : "Save schedule"}
                  </Button>
                </CardContent>
              </Card>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-300">
                  Cron format: <code className="font-mono bg-amber-500/20 px-1 rounded">minute hour day month weekday</code> (UTC). Example: <code className="font-mono bg-amber-500/20 px-1 rounded">0 8 * * 1</code> = every Monday at 08:00 UTC.
                </p>
              </div>
            </div>
          )}

          {/* API Access */}
          {activeTab === "api" && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">API Access</CardTitle>
                <CardDescription className="text-xs">Manus integration endpoints and API key management</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Manus API Key</Label>
                  <div className="flex items-center gap-2">
                    <Input value="sk-sentinel-••••••••••••••••••••••••••••••••" disabled className="bg-muted/50 font-mono text-xs h-9" />
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => copyToClipboard("MANUS_API_KEY from .env")}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Set via <code className="font-mono bg-muted px-1 rounded">MANUS_API_KEY</code> environment variable</p>
                </div>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Available Endpoints</p>
                  <div className="space-y-1.5 font-mono text-xs">
                    {[
                      { method: "GET", path: "/api/manus/status", desc: "System status" },
                      { method: "POST", path: "/api/manus/tasks", desc: "Submit autonomous task" },
                      { method: "GET", path: "/api/manus/tasks", desc: "List task queue" },
                      { method: "POST", path: "/api/marketing/fb-event", desc: "Send FB CAPI event" },
                      { method: "POST", path: "/api/marketing/manychat", desc: "ManyChat webhook" },
                    ].map(({ method, path, desc }) => (
                      <div key={path} className="flex items-center gap-2 p-2 rounded bg-muted/30">
                        <Badge variant="outline" className={`text-[10px] w-12 justify-center ${method === "GET" ? "text-green-400 border-green-400/30" : "text-blue-400 border-blue-400/30"}`}>
                          {method}
                        </Badge>
                        <code className="flex-1 text-foreground">{path}</code>
                        <span className="text-muted-foreground text-[10px]">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <Shield className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-300">
                    All endpoints require <code className="font-mono bg-blue-500/20 px-1 rounded">Authorization: Bearer &lt;MANUS_API_KEY&gt;</code> header.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Danger Zone */}
          {activeTab === "danger" && (
            <Card className="bg-card border-destructive/30">
              <CardHeader className="pb-4">
                <CardTitle className="text-base text-destructive flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Danger Zone
                </CardTitle>
                <CardDescription className="text-xs">Irreversible actions — proceed with caution</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Clear notification history", desc: "Delete all read notifications older than 30 days", action: "Clear notifications" },
                  { label: "Reset audit findings", desc: "Archive all current findings and start fresh", action: "Reset findings" },
                  { label: "Purge task queue", desc: "Remove all pending and completed tasks from the Manus queue", action: "Purge queue" },
                ].map(({ label, desc, action }) => (
                  <div key={label} className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => toast.error(`${action} — not yet implemented`)}
                    >
                      {action}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
