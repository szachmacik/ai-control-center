import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "../lib/trpc";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ArrowLeft, GitCompare, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Plus, RotateCcw } from "lucide-react";

type Severity = "critical" | "high" | "medium" | "low" | "info";

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-blue-100 text-blue-800 border-blue-200",
  info: "bg-gray-100 text-gray-700 border-gray-200",
};

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export default function SandboxCompare() {
  const [, navigate] = useLocation();
  const [sandboxId, setSandboxId] = useState<string>("");
  const [scanAId, setScanAId] = useState<string>("");
  const [scanBId, setScanBId] = useState<string>("");

  // Load sandbox list
  const { data: sandboxes } = trpc.sandbox.list.useQuery();

  // Load scan history for selected sandbox (reuse getScanTrend to get list)
  const { data: trendData } = trpc.sandbox.getScanTrend.useQuery(
    { sandboxId: Number(sandboxId), limit: 20 },
    { enabled: !!sandboxId }
  );

  // Load comparison
  const {
    data: comparison,
    isLoading: comparing,
    error: compareError,
  } = trpc.sandbox.compareScans.useQuery(
    { sandboxId: Number(sandboxId), baselineScanId: Number(scanAId), compareScanId: Number(scanBId) },
    { enabled: !!sandboxId && !!scanAId && !!scanBId && scanAId !== scanBId }
  );

  const scans = (trendData as any) ?? [];

  function renderTrendBadge(trend: string) {
    if (trend === "improvement") {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-800 font-semibold text-sm">
          <TrendingDown className="w-4 h-4" /> Improvement
        </span>
      );
    }
    if (trend === "degradation") {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-800 font-semibold text-sm">
          <TrendingUp className="w-4 h-4" /> Degradation
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-gray-700 font-semibold text-sm">
        <Minus className="w-4 h-4" /> No Change
      </span>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/sandbox")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitCompare className="w-6 h-6 text-blue-600" />
            Scan Comparison
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Compare two security scans to track vulnerability trends
          </p>
        </div>
      </div>

      {/* Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Scans to Compare</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sandbox</label>
            <Select value={sandboxId} onValueChange={(v) => { setSandboxId(v); setScanAId(""); setScanBId(""); }}>
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder="Select a sandbox..." />
              </SelectTrigger>
              <SelectContent>
                {((sandboxes as any) ?? []).map((sb: any) => (
                  <SelectItem key={sb.id} value={String(sb.id)}>
                    {sb.name} — {sb.targetUrl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {sandboxId && scans.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Baseline Scan (A)</label>
                <Select value={scanAId} onValueChange={setScanAId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select baseline scan..." />
                  </SelectTrigger>
                  <SelectContent>
                    {scans.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)} disabled={String(s.id) === scanBId}>
                        Scan #{s.id} — {s.scanType} — {new Date(s.createdAt).toLocaleDateString("pl-PL")}
                        {s.riskScore != null ? ` (Risk: ${s.riskScore})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comparison Scan (B)</label>
                <Select value={scanBId} onValueChange={setScanBId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select comparison scan..." />
                  </SelectTrigger>
                  <SelectContent>
                    {scans.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)} disabled={String(s.id) === scanAId}>
                        Scan #{s.id} — {s.scanType} — {new Date(s.createdAt).toLocaleDateString("pl-PL")}
                        {s.riskScore != null ? ` (Risk: ${s.riskScore})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {sandboxId && scans.length === 0 && (
            <p className="text-sm text-gray-500">No scans found for this sandbox. Run at least two scans to compare.</p>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {comparing && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3" />
          <span className="text-gray-600">Comparing scans...</span>
        </div>
      )}

      {/* Error */}
      {compareError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          {compareError.message}
        </div>
      )}

      {/* Results */}
      {comparison && (
        <div className="space-y-6">
          {/* Summary */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Comparison Summary</CardTitle>
                {renderTrendBadge((comparison as any).trend)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
                  <div className="text-2xl font-bold text-green-700">
                    {(comparison as any).fixed?.length ?? 0}
                  </div>
                  <div className="text-sm text-green-600 flex items-center justify-center gap-1 mt-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Fixed
                  </div>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-center">
                  <div className="text-2xl font-bold text-red-700">
                    {(comparison as any).newFindings?.length ?? 0}
                  </div>
                  <div className="text-sm text-red-600 flex items-center justify-center gap-1 mt-1">
                    <Plus className="w-3.5 h-3.5" /> New
                  </div>
                </div>
                <div className="rounded-lg bg-orange-50 border border-orange-200 p-4 text-center">
                  <div className="text-2xl font-bold text-orange-700">
                    {(comparison as any).regressions?.length ?? 0}
                  </div>
                  <div className="text-sm text-orange-600 flex items-center justify-center gap-1 mt-1">
                    <RotateCcw className="w-3.5 h-3.5" /> Regressions
                  </div>
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-center">
                  <div className="text-2xl font-bold text-gray-700">
                    {(comparison as any).unchanged?.length ?? 0}
                  </div>
                  <div className="text-sm text-gray-500 flex items-center justify-center gap-1 mt-1">
                    <Minus className="w-3.5 h-3.5" /> Unchanged
                  </div>
                </div>
              </div>

              {/* Risk score delta */}
              {(comparison as any).riskScoreDelta != null && (
                <div className="mt-4 p-3 rounded-lg bg-gray-50 border text-sm text-gray-700">
                  Risk Score change:{" "}
                  <span
                    className={
                      (comparison as any).riskScoreDelta < 0
                        ? "font-bold text-green-700"
                        : (comparison as any).riskScoreDelta > 0
                        ? "font-bold text-red-700"
                        : "font-bold text-gray-600"
                    }
                  >
                    {(comparison as any).riskScoreDelta > 0 ? "+" : ""}
                    {(comparison as any).riskScoreDelta}
                  </span>
                  {" "}(Scan A: {(comparison as any).scanA?.riskScore ?? "N/A"} → Scan B: {(comparison as any).scanB?.riskScore ?? "N/A"})
                </div>
              )}
            </CardContent>
          </Card>

          {/* New Findings */}
          {(comparison as any).newFindings?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-red-700 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  New Findings ({(comparison as any).newFindings.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FindingsList findings={(comparison as any).newFindings} />
              </CardContent>
            </Card>
          )}

          {/* Fixed */}
          {(comparison as any).fixed?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-green-700 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Fixed Vulnerabilities ({(comparison as any).fixed.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FindingsList findings={(comparison as any).fixed} dimmed />
              </CardContent>
            </Card>
          )}

          {/* Regressions */}
          {(comparison as any).regressions?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-orange-700 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Regressions — Previously Fixed ({(comparison as any).regressions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FindingsList findings={(comparison as any).regressions} />
              </CardContent>
            </Card>
          )}

          {/* Unchanged */}
          {(comparison as any).unchanged?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-gray-600 flex items-center gap-2">
                  <Minus className="w-4 h-4" />
                  Unchanged ({(comparison as any).unchanged.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FindingsList findings={(comparison as any).unchanged} dimmed />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Empty state */}
      {!sandboxId && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <GitCompare className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">Select a sandbox and two scans to compare</p>
        </div>
      )}
    </div>
  );
}

// ─── Finding row component ────────────────────────────────────────────────────

function FindingsList({ findings, dimmed = false }: { findings: any[]; dimmed?: boolean }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(idx: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  return (
    <div className={`space-y-2 ${dimmed ? "opacity-60" : ""}`}>
      {findings.map((f: any, idx: number) => {
        const sev = (f.severity ?? "info") as Severity;
        const isOpen = expanded.has(idx);
        return (
          <div
            key={idx}
            className={`rounded-lg border p-3 cursor-pointer hover:shadow-sm transition-shadow ${SEVERITY_COLORS[sev]}`}
            onClick={() => toggle(idx)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Badge variant="outline" className={`shrink-0 text-xs ${SEVERITY_COLORS[sev]}`}>
                  {sev.toUpperCase()}
                </Badge>
                <span className="font-medium text-sm truncate">{f.title ?? f.check}</span>
              </div>
              <span className="text-xs text-gray-500 shrink-0">{f.category}</span>
            </div>
            {isOpen && (
              <div className="mt-2 space-y-1 text-xs text-gray-700">
                {f.description && <p>{f.description}</p>}
                {f.evidence && (
                  <pre className="bg-white/60 rounded p-2 overflow-x-auto text-xs font-mono">
                    {f.evidence}
                  </pre>
                )}
                {f.remediation && (
                  <p className="text-green-800 font-medium">Fix: {f.remediation}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
