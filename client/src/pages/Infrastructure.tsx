import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Server, RefreshCw, Database, Globe, Cpu } from "lucide-react";
import { toast } from "sonner";

export default function Infrastructure() {
  const { data: infra, isLoading, refetch } = trpc.infrastructure.list.useQuery();

  const typeIcon = (type: string) => {
    if (type === "database") return <Database className="w-5 h-5 text-primary" />;
    if (type === "api") return <Globe className="w-5 h-5 text-primary" />;
    return <Server className="w-5 h-5 text-primary" />;
  };

  const statusColor = (status: string) => {
    if (status === "healthy") return "bg-[oklch(0.62_0.17_145/0.1)] text-[oklch(0.62_0.17_145)] border-[oklch(0.62_0.17_145/0.25)]";
    if (status === "degraded") return "bg-[oklch(0.72_0.18_75/0.1)] text-[oklch(0.72_0.18_75)] border-[oklch(0.72_0.18_75/0.25)]";
    return "bg-destructive/10 text-destructive border-destructive/25";
  };

  const dotColor = (status: string) => {
    if (status === "healthy") return "bg-[oklch(0.62_0.17_145)] shadow-[0_0_6px_oklch(0.62_0.17_145/0.7)]";
    if (status === "degraded") return "bg-[oklch(0.72_0.18_75)]";
    return "bg-destructive";
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Infrastructure</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor servers, databases and services</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 border-border text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !infra?.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <Server className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground">No infrastructure configured</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {infra.map((item: any) => (
            <Card key={item.id} className="bg-card border-border hover:border-border/80 transition-all">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                      {typeIcon(item.type)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{item.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${dotColor(item.status)}`} />
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor(item.status)}`}>
                      {item.status}
                    </Badge>
                  </div>
                </div>

                {item.url && (
                  <div className="bg-muted/20 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Endpoint</p>
                    <p className="text-xs text-foreground font-mono truncate">{item.url}</p>
                  </div>
                )}

                {item.metadata && (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(item.metadata).slice(0, 4).map(([k, v]) => (
                      <div key={k} className="bg-muted/20 rounded-lg p-2">
                        <p className="text-[10px] text-muted-foreground capitalize">{k}</p>
                        <p className="text-xs text-foreground font-mono truncate">{String(v)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {item.last_checked && (
                  <p className="text-[10px] text-muted-foreground/60">
                    Last checked: {new Date(item.last_checked).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
