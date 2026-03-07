import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookOpen, Search, ExternalLink, FileText, Folder, Brain,
  Zap, Shield, Code2, Bot, Database, Globe, ChevronRight,
  Star, Clock, Download, Eye,
} from "lucide-react";

// ─── Static knowledge base (Drive-backed, no API key needed) ─────────────────
const KNOWLEDGE_ITEMS = [
  {
    id: "autodeploy",
    title: "Autonomous Deployment Knowledge Base",
    category: "deployment",
    tags: ["coolify", "digitalocean", "ci/cd", "docker"],
    description: "Complete guide to autonomous deployment on Coolify + DigitalOcean. Includes build commands, env vars, health checks, and rollback procedures.",
    driveFile: "autonomous-deployment-knowledge-base.md",
    lastUpdated: "2026-03-04",
    readTime: "12 min",
    starred: true,
  },
  {
    id: "mcp-gateway",
    title: "MCP Gateway Architecture",
    category: "architecture",
    tags: ["mcp", "gateway", "agents", "api"],
    description: "Architecture for the Model Context Protocol gateway. How agents communicate, authenticate, and exchange data through the central hub.",
    driveFile: "mcp-gateway-architecture.md",
    lastUpdated: "2026-03-04",
    readTime: "8 min",
    starred: true,
  },
  {
    id: "agent-security",
    title: "Agent Security Architecture",
    category: "security",
    tags: ["totp", "zero-trust", "telegram", "waf"],
    description: "Zero-trust security model for AI agents. TOTP verification, Telegram approval flows, WAF rules, rate limiting, and audit logging.",
    driveFile: "agent-security-architecture.md",
    lastUpdated: "2026-03-04",
    readTime: "10 min",
    starred: false,
  },
  {
    id: "ai-stack-report",
    title: "AI Stack Final Report",
    category: "architecture",
    tags: ["openai", "anthropic", "gemini", "stack"],
    description: "Evaluation of AI provider stacks. Cost analysis, latency benchmarks, and recommendations for each use case in the ofshore.dev ecosystem.",
    driveFile: "ai-stack-final-report.md",
    lastUpdated: "2026-03-03",
    readTime: "15 min",
    starred: false,
  },
  {
    id: "onboarding",
    title: "Agent Onboarding Guide",
    category: "agents",
    tags: ["onboarding", "agents", "workflow", "ecosystem"],
    description: "How to work in the ofshore.dev ecosystem as an AI agent. Conventions, folder structure, task reporting, and communication protocols.",
    driveFile: "agent-onboarding.md",
    lastUpdated: "2026-03-05",
    readTime: "6 min",
    starred: true,
  },
  {
    id: "skill-deploy",
    title: "Skill: Autonomous Deployment",
    category: "skills",
    tags: ["skill", "manus", "deployment", "coolify"],
    description: "Manus skill for autonomous deployment. Covers Coolify API, DigitalOcean App Platform, environment variable management, and health verification.",
    driveFile: "skills/autonomous-deploy/SKILL.md",
    lastUpdated: "2026-03-04",
    readTime: "5 min",
    starred: false,
  },
  {
    id: "skill-qa",
    title: "Skill: QA & Testing Playbook",
    category: "skills",
    tags: ["skill", "vitest", "typescript", "testing"],
    description: "QA playbook for autonomous testing. TypeScript type checking, Vitest unit tests, E2E patterns, and CI/CD integration.",
    driveFile: "playbooks/qa-testing.md",
    lastUpdated: "2026-03-05",
    readTime: "7 min",
    starred: false,
  },
  {
    id: "ofshore-arch",
    title: "ofshore.dev Architecture Notes",
    category: "architecture",
    tags: ["ofshore", "ecosystem", "projects", "domains"],
    description: "Overview of the ofshore.dev ecosystem. All projects, domains, tech stacks, and how they interconnect. The single source of truth for architecture decisions.",
    driveFile: "context/ofshore-architecture.md",
    lastUpdated: "2026-03-06",
    readTime: "9 min",
    starred: true,
  },
];

const CATEGORIES = [
  { id: "all", label: "All", icon: BookOpen },
  { id: "architecture", label: "Architecture", icon: Database },
  { id: "deployment", label: "Deployment", icon: Globe },
  { id: "security", label: "Security", icon: Shield },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "skills", label: "Skills", icon: Zap },
];

const CATEGORY_COLORS: Record<string, string> = {
  architecture: "bg-blue-500/10 text-blue-400 border-blue-500/25",
  deployment: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  security: "bg-red-500/10 text-red-400 border-red-500/25",
  agents: "bg-violet-500/10 text-violet-400 border-violet-500/25",
  skills: "bg-amber-500/10 text-amber-400 border-amber-500/25",
};

function KnowledgeCard({ item }: { item: typeof KNOWLEDGE_ITEMS[0] }) {
  return (
    <Card className="bg-card border-border hover:border-primary/40 transition-all duration-200 group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[item.category] ?? ""}`}>
                {item.category}
              </Badge>
              {item.starred && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
            </div>
            <CardTitle className="text-sm font-semibold leading-tight group-hover:text-primary transition-colors">
              {item.title}
            </CardTitle>
          </div>
          <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
        <div className="flex flex-wrap gap-1">
          {item.tags.map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono">
              #{tag}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{item.readTime}</span>
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{item.lastUpdated}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <Download className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <ExternalLink className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Knowledge() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const filtered = KNOWLEDGE_ITEMS.filter(item => {
    const matchesSearch = !search ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase()) ||
      item.tags.some(t => t.includes(search.toLowerCase()));
    const matchesCategory = activeCategory === "all" || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const starred = filtered.filter(i => i.starred);
  const rest = filtered.filter(i => !i.starred);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            AI Knowledge Base
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Agent onboarding docs, architecture guides, skills, and playbooks
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 text-xs">
          <Folder className="w-3.5 h-3.5" />
          Open Drive Folder
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Documents", value: KNOWLEDGE_ITEMS.length, icon: FileText, color: "text-blue-400" },
          { label: "Starred", value: KNOWLEDGE_ITEMS.filter(i => i.starred).length, icon: Star, color: "text-amber-400" },
          { label: "Categories", value: CATEGORIES.length - 1, icon: Folder, color: "text-violet-400" },
          { label: "Last Updated", value: "Today", icon: Clock, color: "text-emerald-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-3">
              <Icon className={`w-4 h-4 ${color} shrink-0`} />
              <div>
                <p className="text-base font-bold">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Category Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search documents, tags, descriptions…"
            className="pl-9 h-9 text-sm bg-muted/30"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant={activeCategory === id ? "default" : "outline"}
              size="sm"
              className="h-9 text-xs gap-1.5"
              onClick={() => setActiveCategory(id)}
            >
              <Icon className="w-3 h-3" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Starred */}
      {starred.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <h2 className="text-sm font-semibold">Pinned</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {starred.map(item => <KnowledgeCard key={item.id} item={item} />)}
          </div>
        </div>
      )}

      {/* Rest */}
      {rest.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">All Documents</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {rest.map(item => <KnowledgeCard key={item.id} item={item} />)}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No documents match your search.</p>
        </div>
      )}

      {/* Quick links */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Code2 className="w-4 h-4 text-primary" />
            Quick Links
          </CardTitle>
          <CardDescription className="text-xs">Direct access to key resources</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: "ofshore-agents/ on Google Drive", desc: "Root folder for all agent files" },
            { label: "Manus Skills Repository", desc: "Available skills for autonomous tasks" },
            { label: "Coolify Dashboard", desc: "Deployment management" },
            { label: "GitHub: szachmacik", desc: "All project repositories" },
          ].map(({ label, desc }) => (
            <button
              key={label}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border hover:border-primary/40 hover:bg-muted/50 transition-all text-left group"
            >
              <div>
                <p className="text-xs font-medium">{label}</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
