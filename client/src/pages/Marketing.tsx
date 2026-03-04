import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Megaphone, TrendingUp, Users, DollarSign, Zap, RefreshCw,
  CheckCircle2, XCircle, Clock, Activity,
} from "lucide-react";
import { toast } from "sonner";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent: "bg-green-500/10 text-green-400 border-green-500/20",
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    done: "bg-green-500/10 text-green-400 border-green-500/20",
    running: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    ACTIVE: "bg-green-500/10 text-green-400 border-green-500/20",
    PAUSED: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20"}`}>
      {status}
    </span>
  );
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("pl-PL");
}

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return `${(n / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN`;
}

function StatsCards({ stats }: { stats: any }) {
  const cards = [
    { label: "Aktywne kampanie", value: fmt(stats?.activeCampaigns), icon: Megaphone, color: "text-blue-400" },
    { label: "Łączny spend", value: fmtMoney(stats?.totalSpend), icon: DollarSign, color: "text-green-400" },
    { label: "Leady", value: fmt(stats?.totalLeads), icon: Users, color: "text-purple-400" },
    { label: "FB CAPI events", value: fmt(stats?.totalFbEvents), icon: Activity, color: "text-orange-400" },
    { label: "ManyChat events", value: fmt(stats?.totalManychatEvents), icon: TrendingUp, color: "text-pink-400" },
    { label: "Manus queue", value: fmt(stats?.pendingManusJobs), icon: Zap, color: "text-yellow-400" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {cards.map((c) => (
        <Card key={c.label} className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <c.icon className={`w-4 h-4 ${c.color}`} />
              <span className="text-xs text-muted-foreground">{c.label}</span>
            </div>
            <div className="text-xl font-bold">{c.value ?? "—"}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CampaignsTab() {
  const { data: campaigns, isLoading, refetch } = trpc.marketing.campaigns.list.useQuery();
  const syncMutation = trpc.marketing.campaigns.sync.useMutation({
    onSuccess: () => { toast.success("Kampanie zsynchronizowane z Meta API"); refetch(); },
    onError: (e: any) => toast.error(`Błąd: ${e.message}`),
  });
  if (isLoading) return <div className="text-muted-foreground text-sm py-8 text-center">Ładowanie...</div>;
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-muted-foreground">{campaigns?.length ?? 0} kampanii</span>
        <Button size="sm" variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          Sync z Meta
        </Button>
      </div>
      {!campaigns?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Brak kampanii. Skonfiguruj FB_ACCESS_TOKEN i kliknij "Sync z Meta".</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kampania</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Leady</TableHead>
              <TableHead className="text-right">Kliknięcia</TableHead><TableHead className="text-right">CPL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((c: any) => (
              <TableRow key={c.campaignId}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell><StatusBadge status={c.status} /></TableCell>
                <TableCell className="text-right">{fmtMoney(c.spend)}</TableCell>
                <TableCell className="text-right">{fmt(c.leads)}</TableCell>
                <TableCell className="text-right">{fmt(c.clicks)}</TableCell>
                <TableCell className="text-right">{c.cpl ? fmtMoney(c.cpl) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function FbEventsTab() {
  const { data: events, isLoading } = trpc.marketing.capi.list.useQuery({ limit: 50 });
  if (isLoading) return <div className="text-muted-foreground text-sm py-8 text-center">Ładowanie...</div>;
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-muted-foreground">{events?.length ?? 0} ostatnich eventów</span>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-400" /> sent</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-yellow-400" /> pending</span>
          <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-400" /> failed</span>
        </div>
      </div>
      {!events?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Brak eventów CAPI. Dodaj integrację na stronie docelowej.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead><TableHead>Status</TableHead>
              <TableHead>URL</TableHead><TableHead>Czas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.eventName}</TableCell>
                <TableCell><StatusBadge status={e.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{e.eventSourceUrl ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString("pl-PL")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ManychatTab() {
  const { data: events, isLoading } = trpc.marketing.manychat.list.useQuery({ limit: 50 });
  if (isLoading) return <div className="text-muted-foreground text-sm py-8 text-center">Ładowanie...</div>;
  return (
    <div>
      <div className="mb-4">
        <span className="text-sm text-muted-foreground">{events?.length ?? 0} ostatnich eventów</span>
      </div>
      {!events?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Brak eventów ManyChat. Skonfiguruj webhook: POST /api/marketing/manychat</p>
          <code className="text-xs mt-2 block bg-muted px-3 py-2 rounded">x-manychat-secret: MANYCHAT_WEBHOOK_SECRET</code>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Typ eventu</TableHead><TableHead>Subscriber ID</TableHead><TableHead>Czas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.eventType}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.subscriberId ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString("pl-PL")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ManusQueueTab() {
  const { data: queue, isLoading, refetch } = trpc.marketing.queue.list.useQuery();
  const submitMutation = trpc.marketing.queue.submit.useMutation({
    onSuccess: () => { toast.success("Zadanie dodane do kolejki"); refetch(); },
    onError: (e: any) => toast.error(`Błąd: ${e.message}`),
  });
  const quickTasks = [
    { label: "Sync kampanii FB", type: "fb.sync_campaigns", icon: RefreshCw },
    { label: "Audyt bezpieczeństwa", type: "audit.security", icon: Zap },
    { label: "Audyt funkcjonalny", type: "audit.functional", icon: CheckCircle2 },
  ];
  if (isLoading) return <div className="text-muted-foreground text-sm py-8 text-center">Ładowanie...</div>;
  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-muted-foreground mb-3">Szybkie zadania Manus:</p>
        <div className="flex gap-2 flex-wrap">
          {quickTasks.map((t) => (
            <Button key={t.type} size="sm" variant="outline"
              onClick={() => submitMutation.mutate({ taskType: t.type, payload: {} })}
              disabled={submitMutation.isPending}>
              <t.icon className="w-3 h-3 mr-1" />{t.label}
            </Button>
          ))}
        </div>
      </div>
      {!queue?.length ? (
        <div className="text-center py-8 text-muted-foreground">
          <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Kolejka pusta.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Typ zadania</TableHead><TableHead>Status</TableHead>
              <TableHead>Zlecone przez</TableHead><TableHead>Czas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.map((q: any) => (
              <TableRow key={q.id}>
                <TableCell className="font-mono text-xs">{q.taskType}</TableCell>
                <TableCell><StatusBadge status={q.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{q.submittedBy ?? "manus"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(q.createdAt).toLocaleString("pl-PL")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function Marketing() {
  const [tab, setTab] = useState("campaigns");
  const { data: stats } = trpc.marketing.stats.useQuery(undefined, { refetchInterval: 30_000 });
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Megaphone className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Marketing</h1>
          <p className="text-sm text-muted-foreground">Facebook Ads · ManyChat · Manus Autonomous Queue</p>
        </div>
      </div>
      <StatsCards stats={stats} />
      <Card className="bg-card border-border">
        <CardHeader className="pb-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-muted/50">
              <TabsTrigger value="campaigns">Kampanie FB</TabsTrigger>
              <TabsTrigger value="fb-events">CAPI Events</TabsTrigger>
              <TabsTrigger value="manychat">ManyChat</TabsTrigger>
              <TabsTrigger value="manus-queue">Manus Queue</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="pt-4">
          <Tabs value={tab}>
            <TabsContent value="campaigns"><CampaignsTab /></TabsContent>
            <TabsContent value="fb-events"><FbEventsTab /></TabsContent>
            <TabsContent value="manychat"><ManychatTab /></TabsContent>
            <TabsContent value="manus-queue"><ManusQueueTab /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
