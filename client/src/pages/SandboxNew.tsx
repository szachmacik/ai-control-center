import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FlaskConical,
  Globe,
  Shield,
  Download,
  Cloud,
  Loader2,
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Lock,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const SCAN_TYPES = [
  { value: "passive", label: "Passive Scan", description: "Headers, cookies, sensitive files — no active attacks", safe: true },
  { value: "headers", label: "Headers Only", description: "HTTP security headers and cookie flags audit", safe: true },
  { value: "csrf", label: "CSRF Check", description: "Cross-Site Request Forgery token validation", safe: true },
  { value: "xss", label: "XSS Only", description: "Cross-Site Scripting injection tests", safe: false },
  { value: "sqli", label: "SQL Injection", description: "SQL injection pattern tests", safe: false },
  { value: "open_redirect", label: "Open Redirect", description: "URL redirect parameter abuse tests", safe: false },
  { value: "full", label: "Full Scan (OWASP Top 10)", description: "All checks: passive + active attacks — most thorough", safe: false },
];

const ENV_LABELS: Record<string, string> = {
  wordpress: "WordPress",
  "wordpress-woocommerce": "WordPress + WooCommerce",
  nextjs: "Next.js",
  nuxtjs: "Nuxt.js",
  laravel: "Laravel",
  symfony: "Symfony",
  django: "Django",
  rails: "Ruby on Rails",
  drupal: "Drupal",
  joomla: "Joomla",
  magento: "Magento 2",
  gatsby: "Gatsby",
  astro: "Astro",
  express: "Express.js",
  "static-nginx": "Static Site (nginx)",
  "php-generic": "PHP Application",
  "node-generic": "Node.js Application",
  "python-generic": "Python Application",
  "react-spa": "React SPA",
  "vue-spa": "Vue.js SPA",
  "angular-spa": "Angular SPA",
  flask: "Flask",
  fastapi: "FastAPI",
};

const SCHEDULE_OPTIONS = [
  { value: "none", label: "No schedule — run once" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface KnownVuln {
  cve: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  affectedVersions: string;
  cvssScore?: string;
}

interface TechPreview {
  profile: {
    environmentType: string;
    detectedTechs: Array<{ name: string; version?: string; confidence: number; category: string }>;
    confidence: number;
    notes: string[];
    knownVulnerabilities: KnownVuln[];
    techSummary: string;
  };
  description: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityColor(sev: string) {
  switch (sev.toLowerCase()) {
    case "critical": return "border-red-500/40 text-red-400 bg-red-500/10";
    case "high": return "border-orange-500/40 text-orange-400 bg-orange-500/10";
    case "medium": return "border-yellow-500/40 text-yellow-400 bg-yellow-500/10";
    case "low": return "border-blue-500/40 text-blue-400 bg-blue-500/10";
    default: return "border-border text-muted-foreground";
  }
}

function severityIcon(sev: string) {
  switch (sev.toLowerCase()) {
    case "critical":
    case "high": return <AlertCircle className="h-3.5 w-3.5" />;
    case "medium": return <AlertTriangle className="h-3.5 w-3.5" />;
    default: return <Info className="h-3.5 w-3.5" />;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SandboxNew() {
  const [, setLocation] = useLocation();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [deployType, setDeployType] = useState<"local_download" | "manus_spaces">("local_download");
  const [anonymize, setAnonymize] = useState(true);
  const [autoScan, setAutoScan] = useState(true);
  const [scanType, setScanType] = useState("passive");
  const [schedule, setSchedule] = useState("none");
  const [techPreview, setTechPreview] = useState<TechPreview | null>(null);
  const [showAllCves, setShowAllCves] = useState(false);
  const [showAllTechs, setShowAllTechs] = useState(false);

  const detectMutation = trpc.sandbox.detectTech.useMutation({
    onSuccess: (data) => {
      setTechPreview(data as TechPreview);
      const vulnCount = (data as TechPreview).profile.knownVulnerabilities?.length ?? 0;
      if (vulnCount > 0) {
        toast.warning(`Detected ${vulnCount} known CVE(s) — review before proceeding`);
      } else {
        toast.success(`Detected: ${data.profile.environmentType}`);
      }
    },
    onError: (err) => toast.error(`Detection failed: ${err.message}`),
  });

  const createMutation = trpc.sandbox.create.useMutation({
    onSuccess: (data) => {
      toast.success("Sandbox creation started!");
      setLocation(`/sandbox/${data.sandboxId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDetect = () => {
    if (!url) return toast.error("Enter a URL first");
    const finalUrl = url.startsWith("http") ? url : `https://${url}`;
    try { new URL(finalUrl); } catch { return toast.error("Invalid URL"); }
    setTechPreview(null);
    detectMutation.mutate({ url: finalUrl });
  };

  const handleCreate = () => {
    if (!name.trim()) return toast.error("Enter a sandbox name");
    if (!url.trim()) return toast.error("Enter a target URL");
    const finalUrl = url.startsWith("http") ? url : `https://${url}`;
    try { new URL(finalUrl); } catch { return toast.error("Invalid URL"); }

    createMutation.mutate({
      name: name.trim(),
      targetUrl: finalUrl,
      deployType,
      anonymize,
      autoScan,
      scanType: scanType as any,
    });
  };

  const vulns = techPreview?.profile.knownVulnerabilities ?? [];
  const criticalHighVulns = vulns.filter((v) => v.severity === "critical" || v.severity === "high");
  const displayedVulns = showAllCves ? vulns : vulns.slice(0, 3);
  const techs = techPreview?.profile.detectedTechs ?? [];
  const displayedTechs = showAllTechs ? techs : techs.slice(0, 6);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <FlaskConical className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">New Security Sandbox</h1>
          <p className="text-sm text-muted-foreground">
            Clone a website into an isolated, anonymized test environment
          </p>
        </div>
      </div>

      {/* Step 1: Target URL */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold">1</span>
            Target Website
          </CardTitle>
          <CardDescription>Enter the URL of the site you want to clone and test</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">Website URL</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="url"
                  placeholder="https://yoursite.com"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setTechPreview(null); }}
                  className="pl-9"
                  onKeyDown={(e) => e.key === "Enter" && handleDetect()}
                />
              </div>
              <Button
                variant="outline"
                onClick={handleDetect}
                disabled={!url || detectMutation.isPending}
                className="gap-2 shrink-0"
              >
                {detectMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Detect Stack
              </Button>
            </div>
          </div>

          {/* Tech detection result */}
          {techPreview && (
            <div className="space-y-3">
              {/* Stack summary */}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">
                      {ENV_LABELS[techPreview.profile.environmentType] ?? techPreview.profile.environmentType}
                    </span>
                    <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                      {techPreview.profile.confidence}% confidence
                    </Badge>
                  </div>
                  {techPreview.profile.techSummary && (
                    <span className="text-xs text-muted-foreground">{techPreview.profile.techSummary}</span>
                  )}
                </div>

                {/* Detected technologies */}
                {techs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Detected Technologies</p>
                    <div className="flex flex-wrap gap-1.5">
                      {displayedTechs.map((t) => (
                        <Badge key={t.name} variant="secondary" className="text-xs gap-1">
                          {t.name}{t.version ? ` ${t.version}` : ""}
                          <span className="opacity-50 text-[10px]">{t.confidence}%</span>
                        </Badge>
                      ))}
                      {techs.length > 6 && (
                        <button
                          type="button"
                          onClick={() => setShowAllTechs(!showAllTechs)}
                          className="text-xs text-primary hover:underline flex items-center gap-0.5"
                        >
                          {showAllTechs ? <><ChevronUp className="h-3 w-3" /> less</> : <><ChevronDown className="h-3 w-3" /> +{techs.length - 6} more</>}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {techPreview.profile.notes.length > 0 && (
                  <div className="space-y-1">
                    {techPreview.profile.notes.map((note, i) => (
                      <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <Info className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" />
                        {note}
                      </p>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground border-t border-primary/10 pt-2">
                  A matching Docker environment will be generated automatically for local testing.
                </p>
              </div>

              {/* CVE warnings */}
              {vulns.length > 0 && (
                <div className={`rounded-lg border p-4 space-y-3 ${
                  criticalHighVulns.length > 0
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-yellow-500/30 bg-yellow-500/5"
                }`}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`h-4 w-4 ${criticalHighVulns.length > 0 ? "text-red-400" : "text-yellow-400"}`} />
                    <span className="text-sm font-medium text-foreground">
                      {vulns.length} Known CVE{vulns.length !== 1 ? "s" : ""} Detected
                    </span>
                    {criticalHighVulns.length > 0 && (
                      <Badge variant="outline" className="text-xs border-red-500/40 text-red-400 bg-red-500/10">
                        {criticalHighVulns.length} Critical/High
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    {displayedVulns.map((vuln) => (
                      <div key={vuln.cve} className="rounded border border-border/50 bg-background/50 p-2.5 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-xs gap-1 ${severityColor(vuln.severity)}`}>
                            {severityIcon(vuln.severity)}
                            {vuln.severity.toUpperCase()}
                          </Badge>
                          <a
                            href={`https://nvd.nist.gov/vuln/detail/${vuln.cve}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono text-primary hover:underline flex items-center gap-0.5"
                          >
                            {vuln.cve}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                          {vuln.cvssScore && (
                            <span className="text-xs text-muted-foreground">CVSS {vuln.cvssScore}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{vuln.description}</p>
                        {vuln.affectedVersions && (
                          <p className="text-xs text-muted-foreground/70">Affected: {vuln.affectedVersions}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {vulns.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setShowAllCves(!showAllCves)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      {showAllCves ? (
                        <><ChevronUp className="h-3 w-3" /> Show less</>
                      ) : (
                        <><ChevronDown className="h-3 w-3" /> Show {vulns.length - 3} more CVEs</>
                      )}
                    </button>
                  )}

                  <p className="text-xs text-muted-foreground/70 border-t border-border/30 pt-2">
                    These vulnerabilities will be tested in the sandbox environment. Update your production site to fix them.
                  </p>
                </div>
              )}

              {vulns.length === 0 && (
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    No known CVEs found for detected technology versions. The sandbox will still run a full security scan.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Sandbox Settings */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold">2</span>
            Sandbox Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Sandbox Name</Label>
            <Input
              id="name"
              placeholder="e.g. My Site — Security Test March 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Deploy type */}
          <div className="space-y-3">
            <Label>Deployment Mode</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeployType("local_download")}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  deployType === "local_download"
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-background hover:border-primary/20"
                }`}
              >
                <Download className="h-4 w-4 mb-2 text-primary" />
                <p className="text-sm font-medium text-foreground">Download ZIP</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Run locally with Docker. Full runtime fidelity.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setDeployType("manus_spaces")}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  deployType === "manus_spaces"
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-background hover:border-primary/20"
                }`}
              >
                <Cloud className="h-4 w-4 mb-2 text-primary" />
                <p className="text-sm font-medium text-foreground">Manus Spaces</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Hosted temporarily in secure sandbox cloud.
                </p>
              </button>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <Lock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Anonymize PII</p>
                  <p className="text-xs text-muted-foreground">
                    Replace emails, phone numbers, NIP, PESEL, IBAN with mock data
                  </p>
                </div>
              </div>
              <Switch checked={anonymize} onCheckedChange={setAnonymize} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Auto-run Security Scan</p>
                  <p className="text-xs text-muted-foreground">
                    Start a scan automatically after cloning completes
                  </p>
                </div>
              </div>
              <Switch checked={autoScan} onCheckedChange={setAutoScan} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Scan Type */}
      {autoScan && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold">3</span>
              Security Scan Type
            </CardTitle>
            <CardDescription>
              Active attack simulations run only against the sandbox — never your production site
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {SCAN_TYPES.map((st) => (
                <button
                  key={st.value}
                  type="button"
                  onClick={() => setScanType(st.value)}
                  className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors ${
                    scanType === st.value
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-background hover:border-primary/20"
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{st.label}</span>
                      {st.safe ? (
                        <Badge variant="outline" className="text-xs border-green-500/30 text-green-400 bg-green-500/5">
                          passive
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-400 bg-orange-500/5">
                          active
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{st.description}</p>
                  </div>
                  {scanType === st.value && (
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Schedule */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold">
              {autoScan ? "4" : "3"}
            </span>
            Recurring Scans
            <Badge variant="outline" className="text-xs border-primary/20 text-primary/70">optional</Badge>
          </CardTitle>
          <CardDescription>
            Schedule automatic security scans to monitor your site over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {SCHEDULE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSchedule(opt.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  schedule === opt.value
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-background hover:border-primary/20"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {opt.value === "none" ? (
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                  )}
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                  {schedule === opt.value && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto" />}
                </div>
              </button>
            ))}
          </div>
          {schedule !== "none" && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
              <Info className="h-3 w-3 text-primary/60 shrink-0" />
              A new scan will run automatically {schedule === "daily" ? "every day" : schedule === "weekly" ? "every week" : "every month"} using the selected scan type.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          variant="outline"
          onClick={() => setLocation("/sandbox")}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          disabled={createMutation.isPending || !name || !url}
          className="flex-1 gap-2"
        >
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FlaskConical className="h-4 w-4" />
          )}
          Create Sandbox
        </Button>
      </div>
    </div>
  );
}
