/**
 * NotificationCenter — Bell icon with dropdown notification feed
 * Polls for new notifications every 30 seconds.
 * Shows unread count badge, allows mark-as-read individually or all at once.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell, ShieldAlert, Bot, ListTodo, Info, CheckCircle2,
  AlertTriangle, XCircle, Check, CheckCheck,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type NotifSeverity = "info" | "warning" | "error" | "success";
type NotifType = "audit" | "agent" | "task" | "system" | "security";

const SEVERITY_ICON: Record<NotifSeverity, React.ElementType> = {
  info:    Info,
  warning: AlertTriangle,
  error:   XCircle,
  success: CheckCircle2,
};

const SEVERITY_COLOR: Record<NotifSeverity, string> = {
  info:    "text-blue-400",
  warning: "text-yellow-400",
  error:   "text-red-400",
  success: "text-green-400",
};

const TYPE_ICON: Record<NotifType, React.ElementType> = {
  audit:    ShieldAlert,
  agent:    Bot,
  task:     ListTodo,
  system:   Info,
  security: ShieldAlert,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: notifs = [], isLoading } = trpc.notifications.list.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  );

  const { data: unreadCount = 0 } = trpc.notifications.unreadCount.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  );

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const handleOpen = (val: boolean) => {
    setOpen(val);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 bg-popover border-border shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="w-3 h-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Notification list */}
        <ScrollArea className="h-[360px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : notifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <CheckCircle2 className="w-8 h-8 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground">All caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifs.map((n: any) => {
                const SeverityIcon = SEVERITY_ICON[n.severity as NotifSeverity] ?? Info;
                const TypeIcon = TYPE_ICON[n.type as NotifType] ?? Info;
                const severityColor = SEVERITY_COLOR[n.severity as NotifSeverity] ?? "text-muted-foreground";

                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/10 cursor-pointer ${
                      !n.isRead ? "bg-primary/[0.03]" : ""
                    }`}
                    onClick={() => {
                      if (!n.isRead) markRead.mutate({ id: n.id });
                      if (n.link) {
                        setOpen(false);
                        window.location.href = n.link;
                      }
                    }}
                  >
                    {/* Icon */}
                    <div className={`mt-0.5 shrink-0 ${severityColor}`}>
                      <SeverityIcon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className={`text-xs font-medium leading-snug ${!n.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1" />
                        )}
                      </div>
                      {n.body && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1">
                        <TypeIcon className="w-2.5 h-2.5 text-muted-foreground/50" />
                        <span className="text-[9px] text-muted-foreground/50 capitalize">{n.type}</span>
                        <span className="text-[9px] text-muted-foreground/40">·</span>
                        <span className="text-[9px] text-muted-foreground/50">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifs.length > 0 && (
          <div className="border-t border-border px-4 py-2">
            <p className="text-[10px] text-muted-foreground text-center">
              Showing last {notifs.length} notifications
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
