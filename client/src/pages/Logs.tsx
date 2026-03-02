import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollText, RefreshCw, Search, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { useState } from "react";

export default function Logs() {
  const [search, setSearch] = useState("");
  const { data: logs, isLoading, refetch } = trpc.logs.list.useQuery({ search: search || undefined });

  const eventIcon = (type: string) => {
    if (type === "error") return <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />;
    if (type === "warning") return <AlertTriangle className="w-3.5 h-3.5 text-[oklch(0.72_0.18_75)] shrink-0" />;
    return <Info className="w-3.5 h-3.5 text-primary shrink-0" />;
  };

  const eventBadgeColor = (type: string) => {
    if (type === "error") return "bg-destructive/10 text-destructive border-destructive/25";
    if (type === "warning") return "bg-[oklch(0.72_0.18_75/0.1)] text-[oklch(0.72_0.18_75)] border-[oklch(0.72_0.18_75/0.25)]";
    return "bg-primary/10 text-primary border-primary/25";
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Activity Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">Agent actions and system events</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 border-border text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search logs…"
          className="pl-9 bg-input border-border"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-14 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !logs?.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <ScrollText className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground">No log entries found</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border overflow-hidden">
          <div className="divide-y divide-border">
            {logs.map((log: any) => (
              <div key={log.id} className="flex items-start gap-3 px-5 py-3 hover:bg-accent/20 transition-colors">
                <div className="mt-0.5">{eventIcon(log.event_type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-foreground leading-snug">{log.message}</p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${eventBadgeColor(log.event_type)}`}>
                      {log.event_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    {log.agent_name && <span className="font-medium">{log.agent_name}</span>}
                    {log.task_id && <span>Task #{log.task_id}</span>}
                    <span className="font-mono">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  {log.details && (
                    <pre className="mt-2 text-[10px] font-mono text-muted-foreground bg-muted/20 rounded p-2 overflow-x-auto">
                      {typeof log.details === "string" ? log.details : JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
