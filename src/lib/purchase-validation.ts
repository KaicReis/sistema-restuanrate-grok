import Decimal from "decimal.js";
type Nota = {
  itens: { quantidade?: number | null; valorUnitario?: number | null; total?: number | null }[];
  totalProdutos?: number | null; totalNota?: number | null;
  desconto?: number | null; frete?: number | null; outrasDespesas?: number | null;
};
export function validarNota(nota: Nota) {
  const number = (n: number | null | undefined) => typeof n === "number" && Number.isFinite(n);
  const diverge = (a: Decimal, b: number | null | undefined) => !number(b) || !a.isFinite() || a.minus(b!).abs().gt("0.01");
  const linhas = nota.itens.flatMap((i, index) => {
    const calculado = number(i.quantidade) && number(i.valorUnitario)
      ? new Decimal(i.quantidade!).times(i.valorUnitario!).toDecimalPlaces(2) : new Decimal(NaN);
    return diverge(calculado, i.total) ? [{ index, mensagem: `Linha ${index + 1}: ${i.quantidade} x ${i.valorUnitario} = ${calculado.toString()} vs total lido ${i.total}` }] : [];
  });
  const soma = nota.itens.reduce((s, i) => s.plus(number(i.total) ? i.total! : NaN), new Decimal(0));
  const totais: string[] = [];
  if (diverge(soma, nota.totalProdutos)) totais.push(`Soma dos itens = ${soma} vs totalProdutos lido ${nota.totalProdutos}`);
  const liquido = new Decimal(number(nota.totalProdutos) ? nota.totalProdutos! : NaN)
    .minus(nota.desconto ?? 0).plus(nota.frete ?? 0).plus(nota.outrasDespesas ?? 0);
  if (diverge(liquido, nota.totalNota)) totais.push(`Produtos - desconto + frete + outras = ${liquido} vs totalNota lido ${nota.totalNota}`);
  return { valido: !linhas.length && !totais.length, linhas, totais };
}
