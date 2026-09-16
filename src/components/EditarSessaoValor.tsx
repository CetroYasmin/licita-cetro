import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Data/hora real da sessão de disputa (próximo evento tem prioridade). */
export function sessaoDeLicitacao(l: any): string | null {
  return l?.proximo_evento_data ?? l?.data_sessao ?? null;
}

/** Já ocorreu? Sessão no passado. */
export function sessaoJaOcorreu(l: any): boolean {
  const s = sessaoDeLicitacao(l);
  if (!s) return false;
  const t = new Date(s).getTime();
  return Number.isFinite(t) && t < Date.now();
}

/** ISO -> valor de <input type="datetime-local"> no fuso local. */
function paraInputLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Permite corrigir manualmente a data/hora da sessão (licitação adiada) e o
 * valor estimado, quando o portal não atualiza automaticamente.
 */
export function EditarSessaoValor({
  licitacao,
  compacto = false,
}: {
  licitacao: any;
  compacto?: boolean;
}) {
  const qc = useQueryClient();
  const [quando, setQuando] = useState(paraInputLocal(sessaoDeLicitacao(licitacao)));
  const [valor, setValor] = useState(
    licitacao.valor_estimado != null ? String(licitacao.valor_estimado) : "",
  );

  const salvar = useMutation({
    mutationFn: async () => {
      const iso = quando ? new Date(quando).toISOString() : null;
      const numeroValor = valor.trim() === "" ? null : Number(valor.replace(",", "."));
      if (numeroValor != null && Number.isNaN(numeroValor)) throw new Error("Valor inválido.");
      const { error } = await supabase
        .from("licitacoes")
        .update({
          proximo_evento_data: iso,
          data_sessao: iso ? iso.slice(0, 10) : null,
          valor_estimado: numeroValor,
          ultima_atualizacao: new Date().toISOString(),
        })
        .eq("id", licitacao.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Data e valor atualizados.");
      void qc.invalidateQueries({ queryKey: ["licitacoes"] });
      void qc.invalidateQueries({ queryKey: ["relatorios"] });
      void qc.invalidateQueries({ queryKey: ["em-andamento"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alterado =
    quando !== paraInputLocal(sessaoDeLicitacao(licitacao)) ||
    valor !== (licitacao.valor_estimado != null ? String(licitacao.valor_estimado) : "");

  return (
    <div className={compacto ? "flex flex-wrap items-end gap-2" : "grid gap-2 sm:grid-cols-3"}>
      <div className="space-y-1">
        {!compacto && <Label className="text-xs">Data/hora da sessão</Label>}
        <Input
          type="datetime-local"
          className="h-8 w-[200px] text-xs"
          value={quando}
          onChange={(e) => setQuando(e.target.value)}
          aria-label="Data e hora da sessão"
        />
      </div>
      <div className="space-y-1">
        {!compacto && <Label className="text-xs">Valor estimado (R$)</Label>}
        <Input
          type="number"
          step="0.01"
          className="h-8 w-[160px] text-xs"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="0,00"
          aria-label="Valor estimado"
        />
      </div>
      <div className="space-y-1">
        {!compacto && <Label className="text-xs invisible">Salvar</Label>}
        <Button
          size="sm"
          className="h-8"
          disabled={!alterado || salvar.isPending}
          onClick={() => salvar.mutate()}
        >
          {salvar.isPending ? "Salvando…" : "Atualizar"}
        </Button>
      </div>
    </div>
  );
}
