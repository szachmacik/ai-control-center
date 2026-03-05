import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Bot,
  ListTodo,
  Server,
  KeyRound,
  ScrollText,
  ShieldCheck,
  Megaphone,
  FolderPlus,
  Settings,
  Terminal,
} from "lucide-react";

const PAGES = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/", group: "Navigation" },
  { icon: Bot, label: "Agents", path: "/agents", group: "Navigation" },
  { icon: ListTodo, label: "Tasks", path: "/tasks", group: "Navigation" },
  { icon: Server, label: "Infrastructure", path: "/infrastructure", group: "Navigation" },
  { icon: KeyRound, label: "Secrets", path: "/secrets", group: "Navigation" },
  { icon: ScrollText, label: "Activity Logs", path: "/logs", group: "Navigation" },
  { icon: ShieldCheck, label: "Audits", path: "/audits", group: "Navigation" },
  { icon: Megaphone, label: "Marketing", path: "/marketing", group: "Navigation" },
  { icon: FolderPlus, label: "New Project", path: "/projects/new", group: "Actions" },
  { icon: Settings, label: "Settings", path: "/settings", group: "Actions" },
  { icon: Terminal, label: "Component Showcase", path: "/showcase", group: "Developer" },
];

interface GlobalSearchProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function GlobalSearch({ open: controlledOpen, onOpenChange }: GlobalSearchProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [, navigate] = useLocation();

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    },
    [open, setOpen]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleSelect = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const groups = Array.from(new Set(PAGES.map((p) => p.group)));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((group, gi) => (
          <div key={group}>
            {gi > 0 && <CommandSeparator />}
            <CommandGroup heading={group}>
              {PAGES.filter((p) => p.group === group).map((page) => (
                <CommandItem
                  key={page.path}
                  value={page.label}
                  onSelect={() => handleSelect(page.path)}
                  className="cursor-pointer"
                >
                  <page.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {page.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

/** Trigger button shown in topbar */
export function GlobalSearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 border border-border rounded-md hover:bg-muted transition-colors w-48 md:w-64"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <span className="flex-1 text-left">Search...</span>
      <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  );
}
