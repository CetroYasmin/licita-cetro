import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { aoDigitarMoeda, numeroDaMoeda } from "@/lib/formato";

export const FASES = [
  "Recebimento de propostas",
  "Sessão de disputa",
  "Julgamento das propostas",
  "Habilitação",
  "Diligência",
  "Intenção de recurso",
  "Recurso",
  "Adjudicação",
  "Homologação",
  "Contratação",
] as const;

type Linha = { nome: string; valor: string };

const VAZIO: Linha[] = Array.from({ length: 5 }, () => ({ nome: "", valor: "" }));

const emReais = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Registro manual do resultado da sessão: as 5 primeiras empresas colocadas,
 * a posição da nossa empresa e a fase atual da licitação.
 */
export function ResultadoDisputa({ licitacao }: { licitacao: any }) {
  const { equipeId } = useAuth();
  const qc = useQueryClient();

  const { data: concorrentes } = useQuery({
    queryKey: ["concorrentes", licitacao.id],
    enabled: Boolean(equipeId),
    queryFn: async () =>
      (
        await supabase
          .from("concorrentes")
          .select("id,nome,valor_ofertado,posicao")
          .eq("licitacao_id", licitacao.id)
          .order("posicao", { ascending: true })
      ).data ?? [],
  });

  const [linhas, setLinhas] = useState<Linha[]>(VAZIO);
  const [posicao, setPosicao] = useState(
    licitacao.posicao_empresa != null ? String(licitacao.posicao_empresa) : "",
  );
  const [fase, setFase] = useState<string>(licitacao.fase ?? "");

  useEffect(() => {
    if (!concorrentes) return;
    const base = Array.from({ length: 5 }, (_, i) => {
      const c = concorrentes.find((x: any) => x.posicao === i + 1);
      return { nome: c?.nome ?? "", valor: emReais(c?.valor_ofertado) };
    });
    setLinhas(base);
  }, [concorrentes]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!equipeId) throw new Error("Equipe não definida");
      const { error: erroUpdate } = await supabase
        .from("licitacoes")
        .update({
          posicao_empresa: posicao ? Number(posicao) : null,
          fase: fase || null,
          ultima_atualizacao: new Date().toISOString(),
        })
        .eq("id", licitacao.id);
      if (erroUpdate) throw erroUpdate;

      const { error: erroDelete } = await supabase
        .from("concorrentes")
        .delete()
        .eq("licitacao_id", licitacao.id)
        .lte("posicao", 5);
      if (erroDelete) throw erroDelete;

      const novos = linhas
        .map((l, i) => ({ ...l, posicao: i + 1 }))
        .filter((l) => l.nome.trim().length > 0)
        .map((l) => ({
          licitacao_id: licitacao.id,
          equipe_id: equipeId,
          nome: l.nome.trim(),
          posicao: l.posicao,
          valor_ofertado: numeroDaMoeda(l.valor),
          vencedor: l.posicao === 1,
        }));
      if (novos.length > 0) {
        const { error } = await supabase.from("concorrentes").insert(novos);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Resultado da disputa salvo.");
      void qc.invalidateQueries({ queryKey: ["concorrentes", licitacao.id] });
      void qc.invalidateQueries({ queryKey: ["em-andamento"] });
      void qc.invalidateQueries({ queryKey: ["licitacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Posição da nossa empresa</Label>
          <Input
            type="number"
            min={1}
            className="h-8 text-xs"
            value={posicao}
            onChange={(e) => setPosicao(e.target.value)}
            placeholder="ex.: 2"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fase atual da licitação</Label>
          <Select value={fase} onValueChange={setFase}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecionar fase" />
            </SelectTrigger>
            <SelectContent>
              {FASES.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">5 primeiras empresas colocadas</Label>
        {linhas.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 text-xs font-semibold text-muted-foreground">{i + 1}º</span>
            <Input
              className="h-8 flex-1 text-xs"
              value={l.nome}
              placeholder="Nome da empresa"
              onChange={(e) =>
                setLinhas((v) =>
                  v.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)),
                )
              }
            />
            <Input
              className="h-8 w-[150px] text-xs"
              inputMode="numeric"
              value={l.valor}
              placeholder="R$ 0,00"
              onChange={(e) =>
                setLinhas((v) =>
                  v.map((x, j) => (j === i ? { ...x, valor: aoDigitarMoeda(e.target.value) } : x)),
                )
              }
            />
          </div>
        ))}
      </div>

      <Button size="sm" className="h-8" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
        {salvar.isPending ? "Salvando…" : "Salvar resultado"}
      </Button>
    </div>
  );
}
