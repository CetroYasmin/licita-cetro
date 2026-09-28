import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PortaisAcessos } from "@/components/PortaisAcessos";

export const Route = createFileRoute("/portais")({
  head: () => ({
    meta: [
      { title: "Acessos aos portais - Licitações Cetro" },
      {
        name: "description",
        content:
          "Cadastre e acompanhe os acessos da equipe aos portais de licitação: link, login, vencimento e senha criptografada.",
      },
      { property: "og:title", content: "Acessos aos portais - Licitações Cetro" },
      {
        property: "og:description",
        content: "Logins da equipe nos portais de licitação, com senhas criptografadas.",
      },
    ],
  }),
  component: Portais,
});

function Portais() {
  return (
    <AppLayout
      titulo="Acessos aos portais"
      descricao="Logins da equipe nos portais de licitação — as senhas ficam criptografadas"
    >
      <PortaisAcessos />
    </AppLayout>
  );
}
