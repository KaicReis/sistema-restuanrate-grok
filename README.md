# DNA do Restaurante

Primeira versão de um sistema de **precificação pelo DNA financeiro mensal**, em português do Brasil. Next.js (App Router), TypeScript e Tailwind CSS; preparado para deploy na Vercel sem configurações adicionais de build.

## Rodar localmente

Requer Node.js 20.9 ou superior e npm.

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Para verificar a aplicação:

```bash
npm test
npm run build
npm start
```

`npm run typecheck` verifica os tipos separadamente. `npm start` usa a build de produção.

## Deploy na Vercel

1. Envie os arquivos para o repositório `KaicReis/sistema-restuanrate-grok`.
2. Na Vercel, importe o repositório pelo fluxo **Add New → Project**.
3. A Vercel detecta Next.js automaticamente. Mantenha a raiz do repositório como Root Directory e as configurações padrão; clique em **Deploy**.

Não há variáveis de ambiente nem banco para configurar nesta v1. Os dados pertencem ao navegador e à origem (domínio): localhost, preview e produção têm armazenamentos diferentes. Exporte/importação de backup transfere os dados entre eles. O aplicativo não possui autenticação, sincronização, servidor de dados nem histórico de preços de compra.

## Como usar

1. Selecione ou cadastre o restaurante. A Vila, Nativo’s Sushi e Bora Burguer’s vêm cadastrados, sem valores financeiros atuais presumidos.
2. Escolha a competência mensal no cabeçalho. Um mês novo inicia com faturamento zero, margem de 30% e quatro canais sem taxas: Salão, Retirada, Delivery próprio e Aplicativo. Faturamento zero bloqueia a precificação até completar o DNA.
3. No **DNA mensal**, registre faturamento (meta ou realizado), custos fixos, imposto efetivo e meta de margem. Somente natureza **operacional** entra em `f`. Amortização de dívida e “outro” ficam visíveis, fora do cálculo. O regime tributário não determina imposto automaticamente.
4. Em **Canais de venda**, edite o nome e adicione taxas (cartão, comissão etc.), custo fixo por unidade e embalagem. As taxas são somadas e ficam vinculadas à competência.
5. Cadastre **Insumos** e monte **Fichas técnicas** com rendimento em porções, quantidades em g/ml/un e perda adicional de preparo.
6. Em **Precificação**, confira o preço mínimo por produto/canal, informe e salve o preço praticado. Confira diferença, margem gerencial e contribuição em reais e percentual.

Formulários têm salvamento explícito. Salve antes de mudar de tela, restaurante ou competência. Indicadores do DNA refletem os valores salvos. Duplicar mês copia o DNA salvo e as taxas de canais para uma competência sem cadastro; não sobrescreve meses existentes, nem copia preços praticados. Preços praticados pertencem ao canal da competência.

Insumos e fichas pertencem ao restaurante e são comuns a todos os meses. **Editar insumos atualiza imediatamente todas as fichas e os cálculos, inclusive ao consultar competências antigas.** Esta v1 não é um livro contábil imutável.

### Exemplos históricos opcionais

No DNA de A Vila, o botão de histórico carrega **abr/2025, não atual**: meta de R$ 140.000, fixos operacionais de R$ 46.400 e cheque fornecedor de R$ 5.000 classificado como amortização de dívida. Impostos e taxas não foram fornecidos e devem ser revisados. O exemplo nunca sobrescreve um mês existente.

Na lista vazia de insumos de Bora Burguer’s, é possível carregar exemplos identificados como **histórico abr/2025, não atual**: pão brioche R$ 2/un, blend R$ 50/kg (R$ 7,50 por 150 g), mussarela R$ 33/kg e embalagem R$ 2/un. Rendimento demonstrativo de 100%. Uma embalagem cadastrada como insumo não deve ser lançada também como embalagem base/canal: escolha um único modo de contabilizá-la.

## Fórmulas e convenções

A função central é `src/lib/dna.ts → calcularPrecoDNA`:

```text
f = custos fixos operacionais / faturamento de referência
v_c = soma das taxas variáveis do canal
t = alíquota efetiva de imposto
m = meta de margem gerencial (padrão: 0,30)
d_c = 1 − f − v_c − t − m
markup_c = 1 / d_c
PV_c = (CMV de ingredientes + embalagem aplicada + K_c) / d_c
```

Taxas na função central são decimais (`0,30` significa 30%). Valores monetários de entrada/saída são **centavos**. Cadastros guardam centavos inteiros; `decimal.js` trata as divisões, perdas, markups e margens. O CMV calculado preserva frações de centavo até o preço final; o preço mínimo é arredondado **para cima ao centavo**. A exibição de CMV em reais é arredondada apenas para leitura.

`calcularPrecoDNA` retorna `{ viavel: true, percentualFixos, cmvMaximoPercentual, markup, precoMinimo }` ou `{ viavel: false, motivo }`. Faturamento zero, números negativos/não finitos e taxas fora do intervalo são rejeitados. Se `d_c <= 0`, bloqueia o preço e mostra **“O DNA não comporta a margem desejada”**. Aumentar faturamento, reduzir despesas e taxas pode corrigir o denominador. Reduzir CMV reduz o preço quando o denominador é positivo, mas não torna um denominador negativo viável.

### CMV e rendimento

```text
quantidade de uso da compra = quantidade comprada × conversão da unidade
quantidade aproveitável = quantidade de uso da compra × rendimento% / 100
C = preço da compra / quantidade aproveitável
Q ajustada = Q da receita / (1 − perda adicional% / 100)
CMV unitário de ingredientes = soma(Q ajustada × C) / porções
```

kg → g, L → ml, un → un. Rendimento do insumo é o percentual aproveitável (80% = perda de compra de 20%). A perda da ficha é **adicional e específica do preparo**, de 0% até menos de 100%; não repita a mesma perda nos dois campos.

A embalagem do canal **substitui** a embalagem base por porção. Em branco (`null`), usa a embalagem base; valor zero é uma substituição válida. Assim, `CMV_total_c = CMV_ingredientes + embalagem_aplicada`, sem duplicação. `K_c` é o custo fixo por unidade do canal, diferente dos custos fixos mensais.

Com preço praticado `P > 0`:

```text
M = 1 − (CMV_total_c + K_c) / P − f − v_c − t
Contribuição_c = P − CMV_total_c − K_c − P × (v_c + t)
MC% = Contribuição_c / P
```

Fixos são descontados apenas uma vez na margem gerencial. Contribuição não desconta fixos: ela é o montante disponível para cobri-los e formar lucro. Trata-se de um modelo de rateio gerencial sobre faturamento bruto, não de margem líquida contábil.

**Exemplo de conferência:** CMV R$ 14,20, faturamento R$ 100.000, fixos R$ 30.000, variáveis 10%, impostos 6%, meta 30% → `f = 30%`, `d = 24%`, markup `4,166667`, preço mínimo **R$ 59,17**.

## Dados e backup

Todo acesso ao navegador fica em `src/lib/storage`. O contrato `Repositorio` fornece `carregar`, `salvar`, `exportar` e `importar`; as telas trabalham com entidades e cálculos puros, sem chamar `localStorage`. Uma futura implementação pode introduzir API e Postgres nessa fronteira, adaptando o contrato para I/O assíncrono e adicionando autenticação/autorização. As tabelas dependentes têm `restaurante_id`; canais e DNAs também têm competência. Ingredientes e preços possuem referências validadas para impedir cruzamento entre empresas.

- **Exportar backup:** baixa JSON de todos os restaurantes, incluindo todos os meses, insumos, fichas e preços.
- **Importar:** valida versão, tipos, limites, competências, duplicidades e referências antes de solicitar confirmação. Substitui o banco local inteiro; exporte o atual primeiro. Limite de arquivo: 10 MB.
- Falhas de leitura preservam o armazenamento original. Falhas de gravação são exibidas sem informar sucesso.
- Limpar os dados do navegador apaga os registros. Faça backups periódicos. Armazenamento local não deve conter informações sensíveis.

## Estrutura

```text
src/app/                 App Router, layout e estilos Tailwind/CSS
src/components/          Telas mobile-first e formulários
src/lib/dna.ts           Cálculos financeiros puros
src/lib/types.ts         Entidades e vínculos multiempresa
src/lib/storage/         Repositório local, validação de backup e exemplos
 tests/                  Vitest: DNA, custos, competências e backup
```

Os testes cobrem o exemplo de referência, faturamento zero, fixos e soma de percentuais ≥100%, insumos e recálculo, mudanças isoladas de canal, faturamento, mês/restaurante, embalagem única, perdas, contribuição e integridade de backups.
