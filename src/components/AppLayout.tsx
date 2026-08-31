import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Gavel,
  Search,
  CalendarDays,
  Bell,
  MessageSquare,
  BarChart3,
  Users,
  LogOut,
  Menu,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/licitacoes", label: "Licitações", icon: Gavel },
  { to: "/pesquisa", label: "Pesquisa", icon: Search },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/chats", label: "Chats", icon: MessageSquare },
  { to: "/alertas", label: "Alertas", icon: Bell },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/equipe", label: "Equipe", icon: Users },
] as const;

export function AppLayout({
  titulo,
  descricao,
  acoes,
  children,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  const { loading, session, perfil, aprovado, signOut, equipeId } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [aberto, setAberto] = useState(false);

  const { data: naoLidas } = useQuery({
    queryKey: ["alertas-nao-lidas", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () => {
      const { count } = await supabase
        .from("alertas")
        .select("id", { count: "exact", head: true })
        .eq("lida", false);
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="surface-panel max-w-sm p-8 text-center">
          <h1 className="text-xl font-semibold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Entre com sua conta para acompanhar as licitações da sua empresa.
          </p>
          <Button className="mt-6 w-full" onClick={() => navigate({ to: "/auth" })}>
            Entrar
          </Button>
        </div>
      </div>
    );
  }

  if (!aprovado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="surface-panel max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">
            {perfil?.status === "bloqueado" ? "Acesso bloqueado" : "Cadastro em análise"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {perfil?.status === "bloqueado"
              ? "Seu acesso foi bloqueado por um administrador. Fale com o responsável da sua equipe."
              : "Seu cadastro foi recebido e está aguardando aprovação manual de um administrador. Você receberá acesso assim que for liberado."}
          </p>
          <Button variant="outline" className="mt-6" onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background lg:pl-64">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0",
          aberto ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
            LC
          </span>
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold">Licitações Cetro</p>
            <p className="text-[11px] text-sidebar-foreground/70">Acompanhamento de editais</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => {
            const ativo = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setAberto(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  ativo
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {item.to === "/alertas" && (naoLidas ?? 0) > 0 && (
                  <span className="rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-semibold text-sidebar-primary-foreground">
                    {naoLidas}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <p className="truncate px-2 text-xs text-sidebar-foreground/70">{perfil?.email}</p>
          <p className="truncate px-2 text-xs text-sidebar-foreground/50">
            {perfil?.empresa_nome ?? "Empresa não informada"}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => void signOut()}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-3 border-b bg-card px-4 py-3 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setAberto((v) => !v)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{titulo}</h1>
            {descricao && <p className="truncate text-xs text-muted-foreground">{descricao}</p>}
          </div>
          <div className="flex items-center gap-2">{acoes}</div>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
