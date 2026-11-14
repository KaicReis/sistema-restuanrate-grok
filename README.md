# DNA Restaurante v2

Gestão mensal de Bora Burguer’s, Nativo’s Sushi e Bar, com dashboard consolidado da A Vila. Next.js, React e armazenamento local por navegador.

```sh
npm ci
npm test
npm run build
npm run dev
```

## Operações e grupo

Cada operação possui DNA, canais e preços mensais, insumos e fichas próprios. A Vila apresenta KPIs, comparação de operações, evolução mensal e alertas. Seu único lançamento compartilhado é o aluguel, acessível pela configuração do dashboard. O rateio usa o faturamento da competência ou percentuais fixos que devem somar 100%. O arredondamento distribui os centavos restantes pelos maiores restos. O valor rateado é aplicado ao DNA em memória, sem gravar custos duplicados nas operações. Sem faturamento, o rateio proporcional fica pendente; o aluguel continua sendo custo do grupo.

CMV real e custos variáveis mensais (sem impostos) são informados no DNA. Sem esses dados o dashboard indica margem e equilíbrio pendentes. Faturamento pode ser meta ou realizado, explicitado na comparação. O equilíbrio consolidado usa a contribuição ponderada pela receita. Não se infere venda a partir de preços de cardápio.

## Fichas e dados iniciais

Os arquivos em `dados/cardapio/` são a origem dos 113 pratos e dos insumos e preparos sugeridos. `scripts/gerar-cardapio.py` gera `src/lib/storage/cardapio.json` com as confirmações do dono: camarões VM e VG separados; coxinha, pastel, guioza, harumaki, picles e gari comprados prontos; composição de maionese verde, farofa de bacon e blend aguardando preenchimento. Insumos compartilhados pelas cozinhas têm cadastros independentes. Preços de insumos e quantidades desconhecidas permanecem pendentes.

Preços do PDF inicializam o canal Salão a partir de novembro/2026. Delivery não recebe um preço presumido. Itens da ficha podem valer para todos os canais ou para um canal específico, como as cortesias de molho e batata no Salão. Receitas da casa aceitam insumos e outras receitas, convertem rendimento em g/ml/un e propagam perdas e custos até os pratos. Ciclos e referências a outra operação são rejeitados. Quando uma embalagem já é ingrediente da ficha, o valor separado é desconsiderado; nos demais casos, o valor do canal substitui a base da ficha.

## Dados locais e migração

A v2 usa a chave `dna-restaurante:v2`, mantendo a chave original `dna-restaurante:v1`. A migração preserva uma cópia integral em `legadoV1` no backup, mantém os IDs e referências existentes e acrescenta seeds sem sobrescrever nomes já cadastrados. Cadastros antigos de cardápio da Vila passam ao Nativo’s. Aluguel antigo vira lançamento compartilhado; demais despesas antigas da Vila permanecem no legado para revisão, sem presumir sua operação. Backups v1 e v2 são aceitos e validados antes de substituir dados.

Os preços e condições de compra de insumos têm histórico mensal. Registros da v1 formam a base anterior às novas alterações; para insumos novos não se presume um preço antes do primeiro mês informado. Fichas usam o preço vigente na competência selecionada. DNA salva ao sair de um campo válido e avisa quando há alterações pendentes; exportar backups regularmente continua necessário.

## Verificação

Os testes cobrem fórmulas anteriores, backups, rateio proporcional/fixo e centavos, faturamento zero, consolidação sem dupla contagem, encadeamento de receitas e ciclos, cortesias por canal, seeds confirmados pelo dono, migração idempotente e histórico mensal.

## Fórmulas de precificação

Valores monetários são guardados em centavos. `decimal.js` preserva as frações intermediárias e o preço mínimo arredonda para cima ao centavo:

```text
fixos% = (fixos operacionais próprios + aluguel rateado) / faturamento
CMV disponível = 1 − fixos% − taxas do canal − impostos% − meta de margem%
PV mínimo = (CMV da ficha para o canal + embalagem aplicada + custo/unidade) / CMV disponível
Margem gerencial = 1 − custos diretos/PV − fixos% − taxas do canal − impostos%
```

Exemplo de regressão preservado: CMV R$ 14,20, faturamento R$ 100.000, fixos R$ 30.000, taxas 10%, imposto 6%, meta 30% → CMV máximo 24%, markup 4,166667 e preço mínimo R$ 59,17. Faturamento zero e denominador não positivo bloqueiam a sugestão. Amortizações e custos de natureza “outro” ficam fora dos fixos operacionais.

A Vercel publica os commits da `main` usando o build padrão do Next.js. Não há variáveis de ambiente obrigatórias. Cada domínio e dispositivo possui armazenamento local independente; backups são a forma de transferência entre eles.
