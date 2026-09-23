import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthResp = { data: any; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails(id: string): Promise<OAuthResp>;
  approveAuthorization(id: string): Promise<OAuthResp>;
  denyAuthorization(id: string): Promise<OAuthResp>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Autorizar acesso - Licitações Cetro" },
      { name: "description", content: "Autorize um assistente de IA a acessar sua conta nas Licitações Cetro." },
      { property: "og:title", content: "Autorizar acesso - Licitações Cetro" },
      { property: "og:description", content: "Tela de autorização de agentes de IA." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s['authorization_id'] === "string" ? s['authorization_id'] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Pedido de autorização inválido.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(id);
    if (error) throw new Error(error.message);
    const imediato = data?.redirect_url ?? data?.redirect_to;
    if (imediato && !data?.client) throw redirect({ href: imediato });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-8">Não foi possível carregar a autorização: {String(error?.message ?? error)}</main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const nome = details?.client?.name ?? "um aplicativo";

  async function decidir(aprovar: boolean) {
    setBusy(true);
    const { data, error } = aprovar
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) { setBusy(false); setErro(error.message); return; }
    const alvo = data?.redirect_url ?? data?.redirect_to;
    if (!alvo) { setBusy(false); setErro("O servidor não retornou o endereço de retorno."); return; }
    window.location.href = alvo;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6 shadow">
        <h1 className="text-xl font-semibold text-primary">Conectar {nome} à sua conta</h1>
        <p className="text-sm text-muted-foreground">
          Isso permite que {nome} consulte e atualize as licitações da sua equipe em seu nome.
        </p>
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <div className="flex gap-2">
          <Button disabled={busy} onClick={() => decidir(true)}>Autorizar</Button>
          <Button variant="outline" disabled={busy} onClick={() => decidir(false)}>Recusar</Button>
        </div>
      </div>
    </main>
  );
}
