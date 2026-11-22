import { z } from "zod";
import type { Restaurante } from "./types";
import { pedidosRealizadosNoCanal, vendaAnotaiMensalSchema, type VendaAnotaiMensal } from "./vendas-anotai";

const canais = ["delivery", "retirada", "salao"] as const;
const canalSchema = z.enum(canais);
const dataSchema = z.iso.date();
export type CanalVenda = z.infer<typeof canalSchema>;

const linhaSchema = z.strictObject({
  restaurante_id: z.string().min(1),
  canal: canalSchema,
  subtotal: z.number().int().nonnegative(),
});

export const vendaSetorCanalMensalSchema = z.strictObject({
  competencia: z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/),
  periodoAte: dataSchema.optional(),
  linhas: z.array(linhaSchema),
}).refine(
  (venda) => !venda.periodoAte || venda.periodoAte.startsWith(venda.competencia + "-"),
  "A data final deve pertencer à competência.",
).refine(
  ({ linhas }) => new Set(linhas.map(({ restaurante_id, canal }) => JSON.stringify([restaurante_id, canal]))).size === linhas.length,
  "Existe mais de um valor para o mesmo setor e canal.",
).refine(
  ({ linhas }) => Number.isSafeInteger(linhas.reduce((soma, { subtotal }) => soma + subtotal, 0)),
  "A soma dos valores em centavos excede o limite aceito.",
);

export type VendaSetorCanalMensal = z.infer<typeof vendaSetorCanalMensalSchema>;

export const vendasSetoresCanaisSchema = z.array(vendaSetorCanalMensalSchema).refine(
  (meses) => new Set(meses.map(({ competencia }) => competencia)).size === meses.length,
  "Existe mais de uma matriz de faturamento para a mesma competência.",
);

export const LIMITE_CSV_VENDAS = 10 * 1024 * 1024;
const MAX_REGISTROS = 50_000;

type LinhaCsv = { numero: number; campos: string[] };

function normalizar(valor: string) {
  return valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function lerCsv(texto: string, arquivo: string) {
  if (texto.length > LIMITE_CSV_VENDAS)
    throw new Error(`${arquivo}: limite de 10 MB por arquivo.`);
  const fonte = texto.replace(/^\uFEFF/u, "");
  const primeiraLinha = fonte.trimStart().match(/^[^\r\n]*/u)?.[0] ?? "";
  const separador = primeiraLinha.includes(";") ? ";" : ",";
  const linhas: LinhaCsv[] = [];
  let campos: string[] = [];
  let campo = "";
  let aberto = false;
  let fechouAspas = false;
  let linha = 1;
  let inicioRegistro = 1;

  function concluirCampo() {
    campos.push(campo.trim());
    campo = "";
    fechouAspas = false;
  }

  function concluirRegistro() {
    concluirCampo();
    if (campos.some(Boolean) || campos.length > 1) {
      linhas.push({ numero: inicioRegistro, campos });
      if (linhas.length > MAX_REGISTROS + 1)
        throw new Error(`${arquivo}: limite de ${MAX_REGISTROS.toLocaleString("pt-BR")} registros por arquivo.`);
    }
    campos = [];
  }

  for (let i = 0; i < fonte.length; i++) {
    const caractere = fonte[i];
    const quebra = caractere === "\r" || caractere === "\n";
    if (aberto) {
      if (caractere === '"') {
        if (fonte[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          aberto = false;
          fechouAspas = true;
        }
      } else {
        campo += caractere;
        if (caractere === "\n" || (caractere === "\r" && fonte[i + 1] !== "\n")) linha++;
      }
    } else if (caractere === separador) {
      concluirCampo();
    } else if (quebra) {
      concluirRegistro();
      if (caractere === "\r" && fonte[i + 1] === "\n") i++;
      inicioRegistro = ++linha;
    } else if (caractere === '"' && !campo.trim() && !fechouAspas) {
      campo = "";
      aberto = true;
    } else if ((fechouAspas && caractere.trim()) || caractere === '"') {
      throw new Error(`${arquivo}, linha ${linha}: aspas inválidas no CSV.`);
    } else if (!fechouAspas) {
      campo += caractere;
    }
  }
  if (aberto) throw new Error(`${arquivo}, linha ${inicioRegistro}: feche as aspas do campo.`);
  concluirRegistro();
  const [cabecalho, ...registros] = linhas;
  if (!cabecalho) throw new Error(`${arquivo}: o arquivo está vazio.`);
  const nomes = cabecalho.campos.map(normalizar);
  if (nomes.some((nome) => !nome) || new Set(nomes).size !== nomes.length)
    throw new Error(`${arquivo}: o cabeçalho contém colunas sem nome ou duplicadas.`);
  for (const registro of registros)
    if (registro.campos.length !== nomes.length)
      throw new Error(`${arquivo}, linha ${registro.numero}: a quantidade de campos difere do cabeçalho.`);
  return { nomes, registros };
}

function coluna(nomes: string[], nome: string, arquivo: string) {
  const indice = nomes.indexOf(normalizar(nome));
  if (indice === -1) throw new Error(`${arquivo}: falta a coluna “${nome}”.`);
  return indice;
}

function chavePedido(numero: string, data: string, referencia: VendaAnotaiMensal, local: string) {
  if (!numero) throw new Error(`${local}: informe o número do pedido.`);
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(data);
  const dia = partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : data;
  if (!dataSchema.safeParse(dia).success)
    throw new Error(`${local}: use uma data válida em DD/MM/AAAA ou AAAA-MM-DD.`);
  if (!dia.startsWith(referencia.competencia + "-") || (referencia.periodoAte && dia > referencia.periodoAte))
    throw new Error(`${local}: o pedido está fora do período importado no Anotaí.`);
  return JSON.stringify([numero, dia]);
}

function paraCentavos(texto: string, local: string) {
  const reais = texto.replace(/^R\$\s*/u, "");
  const brasileiro = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/u.test(reais);
  const normal = brasileiro ? reais.replaceAll(".", "").replace(",", ".") : reais;
  if (!/^\d+(?:\.\d{1,2})?$/u.test(normal))
    throw new Error(`${local}: informe um valor em reais com até duas casas decimais.`);
  const [parteInteira, decimal = ""] = normal.split(".");
  const centavos = Number(parteInteira) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos)) throw new Error(`${local}: valor acima do limite aceito.`);
  return centavos;
}

function modalidade(valor: string, local: string): CanalVenda {
  const nome = normalizar(valor);
  if (nome === "retirado no estabelecimento") return "retirada";
  if (nome === "consumido no estabelecimento") return "salao";
  const resultado = canalSchema.safeParse(nome);
  if (!resultado.success) throw new Error(`${local}: informe Delivery, Retirada ou Salão.`);
  return resultado.data;
}

function lerPedidos(pedidosCsv: string, referencia: VendaAnotaiMensal) {
  const { nomes, registros } = lerCsv(pedidosCsv, "Pedidos");
  const anotai = nomes.includes("numero do pedido");
  const numero = coluna(nomes, anotai ? "Número do Pedido" : "pedido", "Pedidos");
  const data = coluna(nomes, "data", "Pedidos");
  const canal = coluna(nomes, anotai ? "Retirada" : "canal", "Pedidos");
  const subtotal = coluna(nomes, anotai ? "Subtotal (Total - Valor do frete)" : "subtotal_sem_frete", "Pedidos");
  const status = anotai ? coluna(nomes, "Status", "Pedidos") : undefined;
  const pedidos = new Map<string, { linha: number; canal: CanalVenda; subtotal: number; somaItens: number; temItens: boolean }>();
  const totais = {
    delivery: { pedidos: 0, subtotal: 0 },
    retirada: { pedidos: 0, subtotal: 0 },
    salao: { pedidos: 0, subtotal: 0 },
  };
  for (const registro of registros) {
    const { numero: linha, campos } = registro;
    if (status !== undefined) {
      const situacao = normalizar(campos[status]);
      if (situacao !== "finalizado" && !(referencia.expiradosPorCanal && situacao === "pedido online expirado")) continue;
    }
    const local = `Pedidos, linha ${linha}`;
    const chave = chavePedido(campos[numero], campos[data], referencia, local);
    if (pedidos.has(chave)) throw new Error(`${local}: número e data de pedido repetidos.`);
    const tipo = modalidade(campos[canal], local);
    const valor = paraCentavos(campos[subtotal], local);
    totais[tipo].pedidos++;
    totais[tipo].subtotal += valor;
    pedidos.set(chave, { linha, canal: tipo, subtotal: valor, somaItens: 0, temItens: false });
  }
  for (const canal of canais) {
    const esperado = pedidosRealizadosNoCanal(referencia, canal);
    if (totais[canal].pedidos !== esperado.pedidos || totais[canal].subtotal !== esperado.subtotal)
      throw new Error(`Pedidos: a quantidade ou o subtotal de ${canal === "salao" ? "salão" : canal} diverge do Anotaí para o período.`);
  }
  return pedidos;
}

export function importarVendasSetorCanal({ pedidosCsv, itensCsv, setores, referencia }: {
  pedidosCsv: string;
  itensCsv: string;
  setores: readonly Pick<Restaurante, "id" | "nome">[];
  referencia: VendaAnotaiMensal;
}): VendaSetorCanalMensal {
  vendaAnotaiMensalSchema.parse(referencia);
  const pedidos = lerPedidos(pedidosCsv, referencia);
  const { nomes, registros } = lerCsv(itensCsv, "Itens");
  const numero = coluna(nomes, "pedido", "Itens");
  const data = coluna(nomes, "data", "Itens");
  const setor = coluna(nomes, "setor", "Itens");
  const valor = coluna(nomes, "valor_liquido", "Itens");
  const linhas = new Map<string, z.infer<typeof linhaSchema>>();

  for (const registro of registros) {
    const { numero: linha, campos } = registro;
    const local = `Itens, linha ${linha}`;
    const chave = chavePedido(campos[numero], campos[data], referencia, local);
    const pedido = pedidos.get(chave);
    if (!pedido) throw new Error(`${local}: pedido sem correspondência entre os pedidos contabilizados.`);
    const textoSetor = campos[setor];
    const correspondencias = setores.filter(({ nome }) => nome === textoSetor);
    const operacao = setores.find(({ id }) => id === textoSetor) ?? (correspondencias.length === 1 ? correspondencias[0] : undefined);
    if (!operacao) throw new Error(`${local}: use o ID ou o nome exato de um setor cadastrado.`);
    const centavos = paraCentavos(campos[valor], local);
    pedido.temItens = true;
    pedido.somaItens += centavos;
    if (pedido.somaItens > pedido.subtotal)
      throw new Error(`${local}: os itens ultrapassam o subtotal do pedido sem frete.`);
    const chaveLinha = JSON.stringify([operacao.id, pedido.canal]);
    const atual = linhas.get(chaveLinha);
    if (atual) atual.subtotal += centavos;
    else linhas.set(chaveLinha, { restaurante_id: operacao.id, canal: pedido.canal, subtotal: centavos });
  }

  for (const pedido of pedidos.values())
    if (!pedido.temItens || pedido.somaItens !== pedido.subtotal)
      throw new Error(`Pedidos, linha ${pedido.linha}: confira se todos os itens somam o subtotal sem frete.`);

  return vendaSetorCanalMensalSchema.parse({
    competencia: referencia.competencia,
    ...(referencia.periodoAte ? { periodoAte: referencia.periodoAte } : {}),
    linhas: [...linhas.values()],
  });
}
