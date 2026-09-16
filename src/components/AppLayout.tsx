import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Gavel,
  Search,
  CalendarDays,
  Bell,
  Radar,
  BarChart3,
  BadgeCheck,
  Users,
  Timer,
  LogOut,
  Menu,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/licitacoes", label: "Licitações", icon: Gavel },
  { to: "/em-andamento", label: "Em andamento", icon: Timer },
  { to: "/pesquisa", label: "Pesquisa", icon: Search },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/boletim-real", label: "Boletim", icon: Radar },
  { to: "/alertas", label: "Alertas", icon: Bell },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/aprovacao", label: "Aprovação", icon: BadgeCheck },
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
  const [recolhida, setRecolhida] = useState(false);

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
    <div className={cn("min-h-screen bg-background transition-[padding]", recolhida ? "lg:pl-16" : "lg:pl-64")}>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar text-sidebar-foreground transition-all lg:translate-x-0",
          recolhida ? "w-16" : "w-64",
          aberto ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-sidebar-border px-4">
          {!recolhida && (
            <>
              <span className="flex h-8 w-8 items-center justify-center rounded bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
                LC
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="font-display text-sm font-semibold">Licitações Cetro</p>
                <p className="text-[11px] text-sidebar-foreground/70">Acompanhamento de editais</p>
              </div>
            </>
          )}
          {recolhida && (
            <span className="flex h-8 w-8 items-center justify-center rounded bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
              LC
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-7 w-7 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:flex"
            onClick={() => setRecolhida((v) => !v)}
            aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
            title={recolhida ? "Expandir menu" : "Recolher menu"}
          >
            {recolhida ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => {
            const ativo = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setAberto(false)}
                title={item.label}
                className={cn(
                  "relative flex items-center rounded-md px-3 py-2 text-sm transition-colors",
                  recolhida ? "justify-center" : "gap-3",
                  ativo
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!recolhida && <span className="flex-1">{item.label}</span>}
                {item.to === "/alertas" && (naoLidas ?? 0) > 0 && (
                  <span
                    className={cn(
                      "rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-semibold text-sidebar-primary-foreground",
                      recolhida && "absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center p-0",
                    )}
                  >
                    {recolhida ? ((naoLidas ?? 0) > 9 ? "9+" : naoLidas ?? 0) : naoLidas}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className={cn("border-t border-sidebar-border", recolhida ? "p-2" : "p-3")}>
          {!recolhida && (
            <>
              <p className="truncate px-2 text-xs text-sidebar-foreground/70">{perfil?.email}</p>
              <p className="truncate px-2 text-xs text-sidebar-foreground/50">
                {perfil?.empresa_nome ?? "Empresa não informada"}
              </p>
            </>
          )}
          <Button
            variant="ghost"
            size={recolhida ? "icon" : "sm"}
            className={cn(
              "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              recolhida ? "mt-1 h-8 w-full" : "mt-2 w-full justify-start",
            )}
            onClick={() => void signOut()}
            title="Sair"
          >
            <LogOut className={cn("h-4 w-4", !recolhida && "mr-2")} />
            {!recolhida && "Sair"}
          </Button>
        </div>
      </aside>

      {aberto && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
          onClick={() => setAberto(false)}
        />
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
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
