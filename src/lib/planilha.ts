import type { Alignment, Borders, Fill } from "exceljs";

export type LinhaPlanilha = {
  orgao: string;
  modalidade: string;
  objeto: string;
  qualificacao: string;
  localizacao: string;
  valor: number | null;
  sigiloso?: boolean;
  dataSessao: string | null;
};

const FONTE = { name: "Arial", size: 16 } as const;
const CINZA = "FFBFBFBF";
const CINZA_CLARO = "FFD9D9D9";

const preencher = (cor: string): Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: cor },
});

const borda = (lado?: "esquerda" | "direita"): Partial<Borders> => ({
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: lado === "esquerda" ? "medium" : "thin" },
  right: { style: lado === "direita" ? "medium" : "thin" },
});

const centro: Partial<Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };
const esquerda: Partial<Alignment> = { horizontal: "left", vertical: "middle", wrapText: true };

/** Altura aproximada de uma linha a partir do texto mais longo e da largura da coluna. */
function altura(texto: string, largura: number) {
  const linhas = texto.split("\n").reduce(
    (t, l) => t + Math.max(1, Math.ceil(l.length / Math.max(10, largura * 0.62))),
    0,
  );
  return Math.max(42, Math.min(400, linhas * 21));
}

const LARGURAS: Record<string, number> = {
  A: 1.55,
  B: 30,
  C: 42.45,
  D: 160.33,
  E: 45.9,
  F: 43.1,
  G: 26.66,
  H: 17.9,
};

export async function exportarPlanilhaAcompanhamento(nome: string, linhas: LinhaPlanilha[]) {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  const ws = wb.addWorksheet("LICITAÇÕES - PREVISTA", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 3 }],
  });

  for (const [col, largura] of Object.entries(LARGURAS)) ws.getColumn(col).width = largura;

  ws.getCell("E1").value = "ULTIMA ATUALIZAÇÃO...................";
  ws.getCell("E1").font = { ...FONTE, bold: true };
  ws.getCell("F1").value = new Date();
  ws.getCell("F1").numFmt = "dd/mm/yyyy";
  ws.getCell("F1").font = { ...FONTE, size: 12, bold: true };
  ws.getRow(1).height = 21;

  const cabecalhos: [string, string][] = [
    ["B", "ORGÃO/ENTIDADE"],
    ["C", "MODALIDADE / Nº"],
    ["D", "OBJETO / QUALIFICAÇÃO TECNICA"],
    ["E", "ESTADO / MUNICIPIO"],
    ["F", "VALOR GLOBAL ESTIMADO"],
    ["G", "DATA / HORA"],
  ];
  for (const [col, titulo] of cabecalhos) {
    ws.mergeCells(`${col}2:${col}3`);
    const c = ws.getCell(`${col}2`);
    c.value = titulo;
    c.font = { ...FONTE, bold: true };
    c.alignment = centro;
    c.border = {
      top: { style: "medium" },
      bottom: { style: "medium" },
      left: { style: col === "B" ? "medium" : "thin" },
      right: { style: col === "G" ? "medium" : "thin" },
    };
  }
  ws.getRow(2).height = 21;
  ws.getRow(3).height = 21.6;
  ws.getRow(4).height = 12;

  let r = 5;
  for (const l of linhas) {
    const topo = r;
    const base = r + 1;

    for (const col of ["B", "C", "E", "F"]) {
      ws.mergeCells(`${col}${topo}:${col}${base}`);
      const c = ws.getCell(`${col}${topo}`);
      c.font = { ...FONTE, bold: true };
      c.alignment = centro;
      c.border = borda(col === "B" ? "esquerda" : undefined);
      ws.getCell(`${col}${base}`).border = borda(col === "B" ? "esquerda" : undefined);
    }

    ws.getCell(`B${topo}`).value = l.orgao;
    ws.getCell(`C${topo}`).value = l.modalidade;
    ws.getCell(`E${topo}`).value = l.localizacao;

    const fValor = ws.getCell(`F${topo}`);
    fValor.fill = preencher(CINZA_CLARO);
    ws.getCell(`F${base}`).fill = preencher(CINZA_CLARO);
    if (l.sigiloso || l.valor == null) {
      fValor.value = l.sigiloso ? "SIGILOSO" : "NÃO INFORMADO";
    } else {
      fValor.value = l.valor;
      fValor.numFmt = '_-"R$"\\ * #,##0.00_-;\\-"R$"\\ * #,##0.00_-;_-"R$"\\ * "-"??_-;_-@_-';
    }

    // Objeto na célula cinza; a linha branca logo abaixo recebe a qualificação técnica
    // (fica em branco quando ainda não foi preenchida, para anotação manual).
    const objeto = ws.getCell(`D${topo}`);
    objeto.value = l.objeto;
    objeto.font = { ...FONTE, bold: true };
    objeto.alignment = esquerda;
    objeto.fill = preencher(CINZA);
    objeto.border = borda();

    const qualificacao = ws.getCell(`D${base}`);
    qualificacao.value = l.qualificacao || "";
    qualificacao.font = { ...FONTE, bold: false };
    qualificacao.alignment = esquerda;
    qualificacao.border = borda();

    const dataCel = ws.getCell(`G${topo}`);
    const horaCel = ws.getCell(`G${base}`);
    for (const c of [dataCel, horaCel]) {
      c.font = { ...FONTE, bold: true };
      c.alignment = centro;
      c.border = { ...borda(), right: { style: "medium" } };
    }
    if (l.dataSessao) {
      const d = new Date(l.dataSessao);
      if (!Number.isNaN(d.getTime())) {
        dataCel.value = d;
        dataCel.numFmt = "dd/mm/yyyy";
        horaCel.value = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      }
    }

    ws.getRow(topo).height = altura(l.objeto ?? "", LARGURAS.D);
    ws.getRow(base).height = altura(l.qualificacao || " ", LARGURAS.D);
    r += 2;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nome}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
