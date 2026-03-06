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
  Filter,
  FileDown,
  Gauge,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Severity config ──────────────────────────────────────────────────────────

const SEV: Record<string, { label: string; color: string; bg: string; dot: string; ring: string }> = {
  critical: { label: "Critical", color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20",     dot: "bg-red-500",    ring: "ring-red-500/30" },
  high:     { label: "High",     color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", dot: "bg-orange-500", ring: "ring-orange-500/30" },
  medium:   { label: "Medium",   color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", dot: "bg-yellow-500", ring: "ring-yellow-500/30" },
  low:      { label: "Low",      color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20",   dot: "bg-blue-500",   ring: "ring-blue-500/30" },
  info:     { label: "Info",     color: "text-slate-400",  bg: "bg-slate-500/10 border-slate-500/20", dot: "bg-slate-500",  ring: "ring-slate-500/30" },
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

function SeverityBadge({ severity }: { severity: string }) {
  const s = SEV[severity] ?? SEV.info;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${s.bg} ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function SummaryCard({ label, count, severity, active, onClick }: { label: string; count: number; severity: string; active?: boolean; onClick?: () => void }) {
  const s = SEV[severity] ?? SEV.info;
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border p-3 text-center transition-all w-full ${
        count > 0 ? s.bg : "bg-muted/20 border-border"
      } ${active ? `ring-2 ${s.ring}` : ""} ${count > 0 ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
    >
      <div className={`text-2xl font-bold ${count > 0 ? s.color : "text-muted-foreground"}`}>{count}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </button>
  );
}

// ─── Risk Score Gauge ─────────────────────────────────────────────────────────

function RiskGauge({ score, level }: { score: number; level: string }) {
  const color =
    score >= 60 ? "text-red-400" :
    score >= 40 ? "text-orange-400" :
    score >= 20 ? "text-yellow-400" :
    score >= 5  ? "text-blue-400" : "text-emerald-400";
  const bg =
    score >= 60 ? "bg-red-500" :
    score >= 40 ? "bg-orange-500" :
    score >= 20 ? "bg-yellow-500" :
    score >= 5  ? "bg-blue-500" : "bg-emerald-500";

  return (
    <div className="flex items-center gap-3">
      <Gauge className={`h-4 w-4 ${color}`} />
      <div className="flex-1">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className={`font-semibold ${color}`}>{level}</span>
          <span className="text-muted-foreground">{score}/100</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${bg}`} style={{ width: `${score}%` }} />
        </div>
      </div>
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
          {(finding.cwe || finding.owasp) && (
            <div className="flex gap-2 flex-wrap">
              {finding.cwe && <Badge variant="outline" className="text-xs">{finding.cwe}</Badge>}
              {finding.owasp && <Badge variant="outline" className="text-xs">{finding.owasp}</Badge>}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Scan Types ───────────────────────────────────────────────────────────────

const SCAN_TYPES = [
  { value: "passive",       label: "Passive",       safe: true  },
  { value: "headers",       label: "Headers",       safe: true  },
  { value: "ssl",           label: "SSL/TLS",       safe: true  },
  { value: "csrf",          label: "CSRF",          safe: true  },
  { value: "xss",           label: "XSS",           safe: false },
  { value: "sqli",          label: "SQL Injection", safe: false },
  { value: "open_redirect", label: "Open Redirect", safe: false },
  { value: "full",          label: "Full Scan",     safe: false },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SandboxDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const sandboxId = parseInt(params.id ?? "0");
  const [selectedScanType, setSelectedScanType] = useState("passive");
  const [activeScanId, setActiveScanId] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

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

  const { refetch: refetchExport } = trpc.sandbox.exportFindings.useQuery(
    { sandboxId, severity: severityFilter as any },
    { enabled: false }
  );

  const handleExportCsv = async () => {
    try {
      const result = await refetchExport();
      if (result.data && result.data.csv) {
        const blob = new Blob([result.data.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`Exported ${result.data.count} findings to CSV`);
      } else {
        toast.info("No findings to export");
      }
    } catch {
      toast.error("Failed to export CSV");
    }
  };

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

  const generateReportMutation = trpc.sandbox.generateReport.useMutation({
    onSuccess: (data) => {
      toast.success(`Report generated: ${data.filename}`);
      // Open download URL
      const url = `/api/sandbox/report/${sandboxId}/${data.filename}`;
      window.open(url, "_blank");
      setIsGeneratingReport(false);
    },
    onError: (err) => {
      toast.error(err.message);
      setIsGeneratingReport(false);
    },
  });

  const deleteMutation = trpc.sandbox.delete.useMutation({
    onSuccess: () => {
      toast.success("Sandbox deleted");
      setLocation("/sandbox");
    },
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

  // Risk score calculation from summary
  const riskScore = summary
    ? Math.min(100, (summary.critical ?? 0) * 20 + (summary.high ?? 0) * 10 + (summary.medium ?? 0) * 5 + (summary.low ?? 0) * 2 + (summary.info ?? 0))
    : 0;
  const riskLevel =
    riskScore >= 60 ? "Critical Risk" :
    riskScore >= 40 ? "High Risk" :
    riskScore >= 20 ? "Medium Risk" :
    riskScore >= 5  ? "Low Risk" : "Minimal Risk";

  // Filter findings
  const filteredFindings = [...displayFindings]
    .sort((a: any, b: any) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
    .filter((f: any) => severityFilter === "all" || f.severity === severityFilter)
    .filter((f: any) => categoryFilter === "all" || f.category === categoryFilter);

  // Unique categories for filter
  const categories: string[] = (Array.from(new Set(displayFindings.map((f: any) => String(f.category)))) as string[]).sort();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
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
                <Badge
                  variant="outline"
                  className={`text-xs capitalize ${
                    (sandbox as any).status === "completed" ? "border-emerald-500/30 text-emerald-400" :
                    (sandbox as any).status === "error" ? "border-red-500/30 text-red-400" :
                    (sandbox as any).status === "scanning" ? "border-yellow-500/30 text-yellow-400" :
                    "border-border text-muted-foreground"
                  }`}
                >
                  {(sandbox as any).status}
                </Badge>
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

              {/* Progress bar */}
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
                  <span className="flex items-center gap-1 text-emerald-400">
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
                  {downloadMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Download ZIP
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={() => {
                  if (confirm("Delete this sandbox and all its data?")) {
                    deleteMutation.mutate({ id: sandboxId });
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete
              </Button>
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
                      <span className="flex items-center gap-2">
                        {st.label}
                        {!st.safe && (
                          <span className="text-xs text-orange-400">(active)</span>
                        )}
                      </span>
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
                {startScanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Start Scan
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Info className="h-3 w-3" />
              Active scans (XSS, SQLi, Open Redirect) run only against the sandbox environment — never your production site.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Scan results */}
      {displayScan && (
        <div className="space-y-4">
          {/* Results header */}
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
                <span className="text-xs text-muted-foreground capitalize">
                  {displayScan.scanType} · {displayScan.completedAt ? new Date(displayScan.completedAt).toLocaleTimeString("pl-PL") : ""}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {displayScan.status === "completed" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8"
                  disabled={isGeneratingReport}
                  onClick={() => {
                    setIsGeneratingReport(true);
                    generateReportMutation.mutate({ scanId: displayScan.id, sandboxId, format: "html" });
                  }}
                >
                  {isGeneratingReport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                  Download Report
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => { refetch(); refetchScan(); }} className="gap-1.5 h-8">
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Risk score */}
          {summary && displayScan.status === "completed" && (
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <RiskGauge score={riskScore} level={riskLevel} />
              </CardContent>
            </Card>
          )}

          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-5 gap-3">
              {SEVERITY_ORDER.map((sev) => (
                <SummaryCard
                  key={sev}
                  label={sev.charAt(0).toUpperCase() + sev.slice(1)}
                  count={summary[sev] ?? 0}
                  severity={sev}
                  active={severityFilter === sev}
                  onClick={() => setSeverityFilter(severityFilter === sev ? "all" : sev)}
                />
              ))}
            </div>
          )}

          {/* Filters */}
          {displayFindings.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSeverityFilter("all")}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${severityFilter === "all" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary/50"}`}
                >
                  All severity
                </button>
                {SEVERITY_ORDER.filter(s => displayFindings.some((f: any) => f.severity === s)).map(sev => {
                  const s = SEV[sev];
                  return (
                    <button
                      key={sev}
                      onClick={() => setSeverityFilter(severityFilter === sev ? "all" : sev)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${severityFilter === sev ? `${s.bg} ${s.color}` : "border-border text-muted-foreground hover:border-primary/50"}`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {categories.length > 1 && (
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-7 text-xs w-40">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(severityFilter !== "all" || categoryFilter !== "all") && (
                <button
                  onClick={() => { setSeverityFilter("all"); setCategoryFilter("all"); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear filters
                </button>
              )}
              {displayFindings.length > 0 && (
                <button
                  onClick={handleExportCsv}
                  className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <FileDown className="h-3 w-3" />
                  Export CSV
                </button>
              )}
            </div>
          )}

          {/* Findings list */}
          {filteredFindings.length > 0 ? (
            <div className="space-y-2">
              {filteredFindings.map((finding: any) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
              {filteredFindings.length < displayFindings.length && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Showing {filteredFindings.length} of {displayFindings.length} findings
                </p>
              )}
            </div>
          ) : displayScan.status === "completed" ? (
            <div className="flex flex-col items-center py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
              <p className="text-foreground font-medium">
                {displayFindings.length > 0 ? "No findings match the current filter" : "No findings detected"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {displayFindings.length > 0
                  ? "Try clearing the filters to see all results."
                  : `The ${displayScan.scanType} scan completed with no security issues found.`}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Scan history */}
      {(sandbox as any).scans?.length > 1 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              Scan History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(sandbox as any).scans.map((scan: any) => {
              const sum = scan.summary as any;
              const rs = sum
                ? Math.min(100, (sum.critical ?? 0) * 20 + (sum.high ?? 0) * 10 + (sum.medium ?? 0) * 5 + (sum.low ?? 0) * 2 + (sum.info ?? 0))
                : null;
              const isSelected = activeScanId === scan.id;
              return (
                <button
                  key={scan.id}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${isSelected ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"}`}
                  onClick={() => setActiveScanId(scan.id)}
                >
                  <div className="flex items-center gap-2">
                    <Shield className={`h-3.5 w-3.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-sm text-foreground capitalize">{scan.scanType}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(scan.createdAt).toLocaleDateString("pl-PL")}
                    </span>
                    <Badge variant="outline" className={`text-xs capitalize ${scan.status === "completed" ? "border-emerald-500/30 text-emerald-400" : scan.status === "failed" ? "border-red-500/30 text-red-400" : "border-border"}`}>
                      {scan.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {rs !== null && (
                      <span className={`text-xs font-medium ${rs >= 60 ? "text-red-400" : rs >= 40 ? "text-orange-400" : rs >= 20 ? "text-yellow-400" : rs >= 5 ? "text-blue-400" : "text-emerald-400"}`}>
                        Risk {rs}
                      </span>
                    )}
                    {sum && (
                      <div className="flex items-center gap-1.5">
                        {(sum.critical ?? 0) > 0 && <span className="text-xs text-red-400">{sum.critical}C</span>}
                        {(sum.high ?? 0) > 0 && <span className="text-xs text-orange-400">{sum.high}H</span>}
                        {(sum.medium ?? 0) > 0 && <span className="text-xs text-yellow-400">{sum.medium}M</span>}
                        {sum.total === 0 && <span className="text-xs text-emerald-400">Clean</span>}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
