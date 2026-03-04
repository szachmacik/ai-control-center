import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  Shield,
  Download,
  ExternalLink,
  Play,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Globe,
  Clock,
  FileText,
  FlaskConical,
  Zap,
  Info,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

// ─── Severity config ──────────────────────────────────────────────────────────

const SEV: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  critical: {
    label: "Critical",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    dot: "bg-red-500",
  },
  high: {
    label: "High",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
    dot: "bg-orange-500",
  },
  medium: {
    label: "Medium",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/20",
    dot: "bg-yellow-500",
  },
  low: {
    label: "Low",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    dot: "bg-blue-500",
  },
  info: {
    label: "Info",
    color: "text-slate-400",
    bg: "bg-slate-500/10 border-slate-500/20",
    dot: "bg-slate-500",
  },
};

function SeverityBadge({ severity }: { severity: string }) {
  const s = SEV[severity] ?? SEV.info;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${s.bg} ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function SummaryCard({ label, count, severity }: { label: string; count: number; severity: string }) {
  const s = SEV[severity] ?? SEV.info;
  return (
    <div className={`rounded-lg border p-3 text-center ${count > 0 ? s.bg : "bg-muted/20 border-border"}`}>
      <div className={`text-2xl font-bold ${count > 0 ? s.color : "text-muted-foreground"}`}>{count}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

// ─── Finding Card ─────────────────────────────────────────────────────────────

function FindingCard({ finding }: { finding: any }) {
  const [open, setOpen] = useState(false);
  const s = SEV[finding.severity] ?? SEV.info;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full">
        <div className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer hover:border-primary/30 transition-colors ${open ? s.bg : "bg-card border-border"}`}>
          <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${s.dot}`} />
          <div className="flex-1 text-left min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground">{finding.title}</span>
              <SeverityBadge severity={finding.severity} />
              <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                {finding.category}
              </Badge>
              {finding.cvssScore && (
                <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                  CVSS {finding.cvssScore}
                </Badge>
              )}
            </div>
            {finding.affectedUrl && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{finding.affectedUrl}</p>
            )}
          </div>
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mx-4 mb-2 p-4 rounded-b-lg border border-t-0 border-border bg-muted/20 space-y-4">
          {finding.description && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Description</p>
              <p className="text-sm text-foreground">{finding.description}</p>
            </div>
          )}
          {finding.evidence && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Evidence</p>
              <pre className="text-xs bg-background border border-border rounded p-3 overflow-x-auto text-muted-foreground whitespace-pre-wrap">
                {finding.evidence}
              </pre>
            </div>
          )}
          {finding.remediation && (
            <div>
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1.5">Remediation</p>
              <p className="text-sm text-foreground">{finding.remediation}</p>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const SCAN_TYPES = [
  { value: "passive", label: "Passive" },
  { value: "headers", label: "Headers" },
  { value: "full", label: "Full Scan" },
  { value: "xss", label: "XSS" },
  { value: "sqli", label: "SQL Injection" },
  { value: "csrf", label: "CSRF" },
  { value: "open_redirect", label: "Open Redirect" },
];

export default function SandboxDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const sandboxId = parseInt(params.id ?? "0");
  const [selectedScanType, setSelectedScanType] = useState("passive");
  const [activeScanId, setActiveScanId] = useState<number | null>(null);

  const { data: sandbox, isLoading, refetch } = trpc.sandbox.get.useQuery(
    { id: sandboxId },
    {
      enabled: !!sandboxId,
      refetchInterval: (query) => {
        const s = (query.state.data as any)?.status;
        return s === "cloning" || s === "scanning" ? 2000 : false;
      },
    }
  );

  const { data: scanData, refetch: refetchScan } = trpc.sandbox.getScan.useQuery(
    { scanId: activeScanId!, sandboxId },
    {
      enabled: !!activeScanId,
      refetchInterval: (query) => {
        return (query.state.data as any)?.status === "running" ? 2000 : false;
      },
    }
  );

  const { data: allFindings } = trpc.sandbox.getFindings.useQuery(
    { sandboxId },
    { enabled: !!sandboxId }
  );

  const startScanMutation = trpc.sandbox.startScan.useMutation({
    onSuccess: (data) => {
      setActiveScanId(data.scanId);
      toast.success("Scan started");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const downloadMutation = trpc.sandbox.getDownloadPath.useMutation({
    onSuccess: (data) => toast.success(`ZIP ready: ${data.filename}`),
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!sandbox) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Sandbox not found</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/sandbox")}>
          Back to list
        </Button>
      </div>
    );
  }

  const latestScan = (sandbox as any).scans?.[0];
  const displayScan = scanData ?? latestScan;
  const displayFindings = (scanData as any)?.findings ?? allFindings ?? [];
  const summary = displayScan?.summary as any;

  const isActive = (sandbox as any).status === "cloning" || (sandbox as any).status === "scanning";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/sandbox")} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Sandboxes
        </Button>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{(sandbox as any).name}</span>
      </div>

      {/* Sandbox info card */}
      <Card className="border-border bg-card">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-2">
                <FlaskConical className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">{(sandbox as any).name}</h2>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
                <Globe className="h-3.5 w-3.5" />
                <a
                  href={(sandbox as any).targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors truncate"
                  onClick={(e) => e.stopPropagation()}
                >
                  {(sandbox as any).targetUrl}
                </a>
              </div>

              {/* Progress */}
              {isActive && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {(sandbox as any).notes || "Processing..."}
                    </span>
                    <span>{(sandbox as any).cloneProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${(sandbox as any).cloneProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {!isActive && (sandbox as any).notes && (
                <p className="text-xs text-muted-foreground mb-3">{(sandbox as any).notes}</p>
              )}

              <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date((sandbox as any).createdAt).toLocaleDateString("pl-PL", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
                {(sandbox as any).fileCount > 0 && (
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {(sandbox as any).fileCount} files
                  </span>
                )}
                {(sandbox as any).anonymized && (
                  <span className="flex items-center gap-1 text-green-400">
                    <Lock className="h-3 w-3" />
                    PII anonymized
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 shrink-0">
              {(sandbox as any).sandboxUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => window.open((sandbox as any).sandboxUrl, "_blank")}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Sandbox
                </Button>
              )}
              {(sandbox as any).deployType === "local_download" && !isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => downloadMutation.mutate({ id: sandboxId })}
                  disabled={downloadMutation.isPending}
                >
                  {downloadMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download ZIP
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Run new scan */}
      {!isActive && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Run Security Scan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Select value={selectedScanType} onValueChange={setSelectedScanType}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCAN_TYPES.map((st) => (
                    <SelectItem key={st.value} value={st.value}>
                      {st.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() =>
                  startScanMutation.mutate({
                    sandboxId,
                    scanType: selectedScanType as any,
                    targetUrl: (sandbox as any).sandboxUrl ?? (sandbox as any).targetUrl,
                  })
                }
                disabled={startScanMutation.isPending}
                className="gap-2 shrink-0"
              >
                {startScanMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Start Scan
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Info className="h-3 w-3" />
              Active scans (XSS, SQLi) run only against the sandbox environment — never your production site.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Scan results */}
      {displayScan && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Scan Results
              {displayScan.status === "running" && (
                <span className="flex items-center gap-1.5 text-xs text-yellow-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Scanning...
                </span>
              )}
              {displayScan.status === "completed" && (
                <span className="text-xs text-muted-foreground">
                  {displayScan.scanType} · {new Date(displayScan.completedAt).toLocaleTimeString("pl-PL")}
                </span>
              )}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => { refetch(); refetchScan(); }} className="gap-1.5 h-8">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          {summary && (
            <div className="grid grid-cols-5 gap-3">
              <SummaryCard label="Critical" count={summary.critical} severity="critical" />
              <SummaryCard label="High" count={summary.high} severity="high" />
              <SummaryCard label="Medium" count={summary.medium} severity="medium" />
              <SummaryCard label="Low" count={summary.low} severity="low" />
              <SummaryCard label="Info" count={summary.info} severity="info" />
            </div>
          )}

          {/* Findings list */}
          {displayFindings.length > 0 ? (
            <div className="space-y-2">
              {/* Sort: critical first */}
              {[...displayFindings]
                .sort((a: any, b: any) => {
                  const order = ["critical", "high", "medium", "low", "info"];
                  return order.indexOf(a.severity) - order.indexOf(b.severity);
                })
                .map((finding: any) => (
                  <FindingCard key={finding.id} finding={finding} />
                ))}
            </div>
          ) : displayScan.status === "completed" ? (
            <div className="flex flex-col items-center py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
              <p className="text-foreground font-medium">No findings detected</p>
              <p className="text-sm text-muted-foreground mt-1">
                The {displayScan.scanType} scan completed with no security issues found.
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Scan history */}
      {(sandbox as any).scans?.length > 1 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Scan History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(sandbox as any).scans.map((scan: any) => {
              const sum = scan.summary as any;
              return (
                <button
                  key={scan.id}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors text-left"
                  onClick={() => setActiveScanId(scan.id)}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground capitalize">{scan.scanType}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(scan.createdAt).toLocaleDateString("pl-PL")}
                    </span>
                  </div>
                  {sum && (
                    <div className="flex items-center gap-1.5">
                      {sum.critical > 0 && <span className="text-xs text-red-400">{sum.critical}C</span>}
                      {sum.high > 0 && <span className="text-xs text-orange-400">{sum.high}H</span>}
                      {sum.medium > 0 && <span className="text-xs text-yellow-400">{sum.medium}M</span>}
                      {sum.total === 0 && <span className="text-xs text-emerald-400">Clean</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
