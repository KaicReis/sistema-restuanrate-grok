# DNA Restaurante v3

Gestão mensal de Bora Burguer’s, Nativo’s Sushi e Bar, com dashboard consolidado da A Vila. Next.js, React, Postgres com Drizzle ORM e modo local sem banco.

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

A v2 usa a chave `dna-restaurante:v2`, mantendo a chave original `dna-restaurante:v1`. A migração preserva uma cópia integral em `legadoV1` no backup, mantém os IDs e referências existentes e acrescenta seeds sem sobrescrever nomes já cadastrados. Cadastros antigos de cardápio da Vila passam ao Nativo’s. Aluguel antigo vira lançamento compartilhado; demais despesas antigas da Vila permanecem no legado para revisão, sem presumir sua operação. Backups v1 e v2 são aceitos e validados antes de mesclar dados.

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

## Configuração da v3 na Vercel

Lista exata de variáveis da aplicação (Settings → Environment Variables):

| Variável         | Valor                                                                                                   | Necessidade                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`   | URL Postgres do Neon/Vercel Postgres, com usuário, senha, banco e `sslmode=require` conforme o provedor | Ativa banco, login e sincronização. Sem ela o sistema mantém localStorage e exibe aviso.         |
| `AUTH_SECRET`    | Segredo aleatório com pelo menos 32 caracteres, gerado com `openssl rand -hex 32`                       | Obrigatória com banco. Nunca usar prefixo `NEXT_PUBLIC_`.                                        |
| `OPENAI_API_KEY` | Chave de um projeto OpenAI com acesso ao modelo `gpt-4o-mini` e créditos                                | Obrigatória para leitura de notas; restante funciona sem ela. Nunca usar prefixo `NEXT_PUBLIC_`. |

Não são necessárias outras variáveis da aplicação. E-mail e senha não são variáveis da Vercel. Defina as variáveis em **Production**; se usar Preview, configure banco e segredo separados nesse ambiente. Não copie valores reais para o Git.

1. Disponibilize um banco Postgres e copie a connection string para `DATABASE_URL`. Não há criação automática de banco no build.
2. Cadastre as três variáveis acima na Vercel. O projeto deve usar o preset Next.js, instalação `npm ci` e build `npm run build`. A branch de produção é `main`.
3. Na sua máquina, no checkout do repositório, execute `npm ci`. Carregue `DATABASE_URL` somente na sessão do terminal (ou use `vercel env pull .env.local` e `set -a; . ./.env.local; set +a`). Os arquivos `.env*` estão ignorados pelo Git. Os scripts não leem `.env.local` automaticamente.
4. Execute `npm run db:migrate` **antes de abrir a aplicação com banco habilitado**. Aplica migrações SQL versionadas de `migrations/` via Drizzle; pode ser executado novamente sem repetir migrações. Use a conexão direta do mesmo banco caso o pool do provedor não permita migrações. O usuário da conexão precisa poder criar tabelas.
5. Crie a conta do dono sem cadastro público. No Bash, digite uma senha de pelo menos 12 caracteres sem mostrá-la nem colocá-la no histórico:

   ```bash
   read -rsp 'Senha do dono: ' VILA_PASSWORD
   printf '%s' "$VILA_PASSWORD" | npm run user:create -- dono@exemplo.com owner
   unset VILA_PASSWORD
   ```

   Para cada funcionário, repita com outro e-mail e `staff`. Nesta versão, ambos os perfis acessam a mesma organização e podem editar todas as operações; não há permissões por operação nem recuperação de senha por e-mail. Para redefinir uma senha, o administrador pode remover a conta via banco (as sessões são removidas em cascata) e recriá-la com o mesmo e-mail, sem alterar os dados da organização.

6. Faça **Redeploy** na Vercel após configurar variáveis. Entre com a conta criada. No primeiro acesso, escolha **Importar dados locais automaticamente** ou selecione um backup JSON. Abra também cada navegador/dispositivo que tenha dados antigos e importe a sua cópia quando oferecido. Depois, novos dispositivos carregam os dados da nuvem após o login.
7. Verifique no aviso superior que consta **Sincronizado com a nuvem**. Na operação, teste uma foto pequena de nota, revise os campos e confirme. Reabra em outro dispositivo para conferir os dados.

Sessões duram sete dias, usam cookie HttpOnly/SameSite e Secure em produção. Senhas usam scrypt com salt aleatório. Tokens de sessão são armazenados somente como HMAC com `AUTH_SECRET`; trocar esse segredo invalida sessões. Login tem limite de dez tentativas por e-mail a cada 15 minutos; leitura de notas, 30 por usuário/hora. Essas contagens ficam no banco e funcionam entre instâncias serverless.

## Persistência e sincronização

A tabela `workspaces` guarda o documento completo em JSONB: operações, DNA/despesas, canais, insumos/histórico, receitas, fichas/pratos, preços, rateio, capital de giro e compras. O formato de backup permanece versão 2 para compatibilidade da migração existente; os campos novos são opcionais e validados. `users`, `sessions` e `login_attempts` tratam acesso; `snapshots` mantém uma cópia de cada gravação aceita, na mesma transação.

O navegador salva uma cópia local e envia gravações em sequência com a revisão que leu do banco. Uma alteração concorrente gera conflito, preserva o backup local e interrompe os envios para não sobrescrever outro dispositivo. Exporte o backup e recarregue; a tela oferece mesclar a cópia pendente. A consulta de alterações acontece a cada 15 segundos quando não há envio ou edição ativa. Aguarde o aviso de sincronização antes de fechar a página.

Importações mesclam por ID (DNA/capital por operação e competência, aluguel por competência). O recebido prevalece nos conflitos; as versões completas anteriores ficam em `importacoes` no backup JSON exportado e podem ser recuperadas desse campo como um backup independente. O snapshot local anterior à nuvem também fica em `dna-restaurante:antes-da-nuvem`. A mesclagem nunca confirma um conjunto inválido. Mantenha backups exportados; arquivos com arquivos anteriores arquivados podem crescer e o limite de importação é 10 MB. Os snapshots do banco não têm expiração automática nesta versão; monitore espaço e retenção.

Sem `DATABASE_URL`, o sistema não exige login e mantém o funcionamento anterior local, com aviso explícito de ausência de sincronização. A leitura paga de notas exige banco e login; as demais funções permanecem locais. Um banco configurado mas indisponível não é tratado como modo local silenciosamente.

## Capital de giro

Menu **Capital de giro** em cada operação, com dados por competência, campos opcionais para preenchimento gradual e consolidação no dashboard da A Vila. Montantes em centavos; mês gerencial de 30 dias:

```text
PMR = soma(mix percentual × prazo de recebimento) / 100
PME = estoque em dias, se preenchido; senão estoque em R$ / (compras mensais / 30)
PMP = prazo médio de fornecedores
Ciclo de caixa = PMR + PME − PMP
Custo diário = (compras mensais + despesas fixas sem aluguel + aluguel rateado) / 30
Capital necessário = máximo(0, ciclo × custo diário) + reserva de segurança em R$
```

O piso zero representa a ausência de financiamento necessário para ciclo negativo. A reserva continua incluída. Informe explicitamente zero quando não houver uma despesa ou reserva: vazio é pendência. Mix deve somar 100%, com prazo para cada forma com participação positiva. Compras precisam ser maiores que zero para estimar PME. Faturamento é referência gerencial obrigatória e não é confundido com custo. O botão de aluguel copia o rateio da competência: após alterar o rateio, atualize esse campo novamente. Não inclua aluguel também nas despesas fixas. O consolidado soma o capital das operações e indica individualmente pendências sem apresentar um total incompleto.

## Compras por foto e NFC-e

Na operação, **Compras → Lançar compra** abre a câmera traseira em celulares compatíveis, com seleção de arquivo como alternativa. JPG/PNG/WebP, até 3 MB. A API autenticada envia a imagem à OpenAI no servidor; a chave nunca é enviada ao navegador. Fotos não são persistidas: ficam no processamento da solicitação; dados revisados são salvos no banco. Dados fiscais são enviados à OpenAI para a extração.

Fornecedor, data, itens, quantidades, unidades e valores são editáveis. A associação de insumo é uma sugestão por nome, restrita à operação; revise-a, crie um novo insumo ou ignore a linha. Campos ilegíveis precisam ser corrigidos. A confirmação valida quantidades, total, data e operação. O preço é gravado no histórico do mês da nota, preservando meses posteriores; o último lançamento confirmado no mês define o snapshot desse mês. Custos de receitas e pratos são recalculados pelas fórmulas existentes sobre esse histórico. Histórico de compras exibe todas as notas e linhas da operação.

Também é possível fotografar o QR Code (navegadores com BarcodeDetector) ou colar seu link. A consulta aceita HTTPS de portais fiscais explicitamente permitidos: `nfe.sefaz.ba.gov.br`, `www.sefaz.ba.gov.br`, `nfce.sefaz.ba.gov.br`, `www.fazenda.pr.gov.br`, `www.nfce.fazenda.sp.gov.br`, `nfce.fazenda.mg.gov.br`, `www.sefaz.rs.gov.br`. Não segue redirecionamentos. Portais com CAPTCHA, JavaScript obrigatório, mudança de endereço ou fora dessa lista podem exigir a foto da nota. Não há promessa de contornar restrições dos portais.

## Validação v3

`npm test` cobre fórmulas de capital, pendências, ciclo negativo, importação, confirmação de compras, preços históricos, isolamento entre operações, hash de senha e API de sincronização com migração aplicada em Postgres embarcado (PGlite), incluindo conflito de revisão e snapshots transacionais. `npm run build` verifica o bundle de produção e tipos. A leitura real pela OpenAI e o banco de produção dependem das credenciais configuradas pelo dono.

### Compras por nota — v3.1

A revisão aceita números pt-BR, inclusive `19,9000`, `2,00` e `1.168,98`.
Envie foto (JPG/PNG/WebP), PDF da DANFE com texto ou XML da NF-e, até 3 MB.
O PDF é lido no servidor sem OCR; PDFs digitalizados sem texto devem ser enviados
como foto ou substituídos pelo XML. A leitura de XML não usa OpenAI. Foto, PDF e
consulta por QR continuam exigindo `OPENAI_API_KEY`; todos exigem sessão autenticada.
A IA usa `json_schema`, com números JSON normalizados e texto original para conferência.

A unidade comercial (CX/PC/FD/UN/KG etc.) é preservada separadamente da unidade
do insumo. Revise o conteúdo por embalagem, o vínculo e a unidade do insumo: a tela
mostra quantidade comprada × conteúdo e custo por kg/g/L/ml/un. Conteúdos não
identificados exigem revisão explícita. Alterar entre kg/g ou L/ml converte o fator.
A confirmação grava no insumo o fator por emitente/fornecedor + código (ou descrição
quando não há código), dentro do mesmo backup/snapshot dos demais dados. Não há
nova migração SQL. A conversão confirmada será reutilizada nas próximas notas.

Desconto, frete e outras despesas são rateados pelo valor bruto de cada linha,
com arredondamento que preserva centavos. O desconto total da nota prevalece sobre
a soma de descontos dos itens, evitando desconto duplicado. Linhas ignoradas entram
na conferência e no rateio fiscal, mas não atualizam insumos. Divergências impedem
confirmar até corrigir os campos. O preço salvo é o custo líquido da quantidade
convertida, em centavos, mantendo o histórico mensal.

Os testes incluem os sete produtos da DANFE informada (R$ 1.168,98 em produtos,
R$ 56,46 de desconto e R$ 1.112,52 líquidos), XML com decimais fiscais e PDFs
sintéticos com e sem texto. `npm run db:migrate` e `npm run user:create` usam
`async main()` para funcionar com a saída CJS do tsx.
