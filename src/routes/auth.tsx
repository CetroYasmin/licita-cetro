import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar - Licitações Cetro" },
      {
        name: "description",
        content:
          "Acesse a plataforma Licitações Cetro para acompanhar editais, prazos e resultados da sua empresa.",
      },
      { property: "og:title", content: "Entrar - Licitações Cetro" },
      {
        property: "og:description",
        content: "Login e cadastro na plataforma de acompanhamento de licitações.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, aprovado } = useAuth();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (session && aprovado) void navigate({ to: "/" });
  }, [session, aprovado, navigate]);

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("senha")),
    });
    setEnviando(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Bem-vindo de volta!");
      void navigate({ to: "/" });
    }
  }

  async function cadastrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setEnviando(true);
    const { error } = await supabase.auth.signUp({
      email: String(form.get("email")),
      password: String(form.get("senha")),
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          nome: String(form.get("nome") ?? ""),
          empresa_nome: String(form.get("empresa") ?? ""),
          empresa_cnpj: String(form.get("cnpj") ?? ""),
          telefone: String(form.get("telefone") ?? ""),
        },
      },
    });
    setEnviando(false);
    if (error) toast.error(error.message);
    else
      toast.success("Cadastro enviado! Um administrador precisa aprovar seu acesso.", {
        duration: 8000,
      });
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Não foi possível entrar com o Google.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: "/" });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded bg-sidebar-primary font-bold text-sidebar-primary-foreground">
            LC
          </span>
          <span className="font-display text-lg font-semibold">Licitações Cetro</span>
        </div>
        <div className="max-w-md space-y-4">
          <h2 className="font-display text-3xl font-semibold leading-tight">
            Todo o andamento das suas licitações em um só painel.
          </h2>
          <p className="text-sm text-sidebar-foreground/75">
            Importação automática de editais, prazos com contagem regressiva, posição da sua empresa,
            concorrentes, chats das sessões e alertas em tempo real.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">Acesso liberado após aprovação manual.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Tabs defaultValue="entrar">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="entrar">Entrar</TabsTrigger>
              <TabsTrigger value="cadastrar">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="entrar">
              <form onSubmit={entrar} className="surface-panel space-y-4 p-6">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha"
                    name="senha"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={enviando}>
                  Entrar
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={() => void google()}>
                  Entrar com Google
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="cadastrar">
              <form onSubmit={cadastrar} className="surface-panel space-y-4 p-6">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome completo</Label>
                  <Input id="nome" name="nome" required />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="empresa">Empresa</Label>
                    <Input id="empresa" name="empresa" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ</Label>
                    <Input id="cnpj" name="cnpj" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input id="telefone" name="telefone" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-cad">E-mail</Label>
                  <Input id="email-cad" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="senha-cad">Senha</Label>
                  <Input
                    id="senha-cad"
                    name="senha"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Qualquer pessoa pode se cadastrar, mas o acesso só é liberado após aprovação manual
                  de um administrador.
                </p>
                <Button type="submit" className="w-full" disabled={enviando}>
                  Criar conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
