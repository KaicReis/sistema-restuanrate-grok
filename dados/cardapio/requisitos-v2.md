QA v1 (14/11/2026) - cálculos corretos (59,17; markup 4,167; CMV máx 24%; ficha 14,20; backup ok).
Bugs/validação:
- Salvar insumo vazio não mostra mensagem de erro.
- Nova linha da ficha sempre começa no primeiro insumo; permite duplicar insumo sem aviso.
- Campos numéricos mostram ponto (100000.00) e resultados vírgula; padronizar formato brasileiro com vírgula na entrada e exibição.
- Competência aparece em inglês ("November 2026").
UX:
- Embalagem em 3 lugares (embalagem base da ficha, insumo, embalagem do canal): risco de contar duas vezes.
- DNA exige salvar manual; sem aviso de alterações não salvas. Fazer autosave ou aviso.
- Mobile: linhas de custos fixos irregulares, inputs não usam largura total.
- Mobile: ícones exportar/importar sem rótulo; seletor de restaurante sem seta.
- Alterar preço de insumo reescreve meses anteriores: guardar histórico de preço por mês.
- CMV máx no card de visão geral: deixar claro o canal.
- Badge "Simulação" confuso. Precificação desktop densa e cortada.
Melhorias: validação por campo, confirmação antes de excluir, botão "usar preço sugerido", margem atualiza ao digitar, busca de insumo na ficha, lembrete de backup.

ESTRUTURA DE RESTAURANTES (pedido do Kaic):
- Bora Burguer's (hamburgueria) e Nativo's Sushi são operações separadas, cada uma com seu DNA, insumos, fichas, canais e precificação próprios.
- A Vila é o grupo/visão consolidada: não tem cardápio próprio, mostra relatórios totais somando as operações (faturamento, custos, CMV, margem, comparativo entre operações) para o panorama geral. Custos compartilhados (ex.: aluguel, contador) lançados na A Vila com regra de rateio explícita para as operações.
- Custos compartilhados: por enquanto só o ALUGUEL é dividido entre Bora Burguer's e Nativo's Sushi (lançado na A Vila e rateado; regra configurável, padrão % do faturamento, com opção de % fixo manual). Demais custos são lançados direto em cada operação.
- Nova operação separada: BAR (setor da A Vila), com DNA, insumos, fichas (drinks) e precificação próprios. Aluguel rateado entre Bora Burguer's, Nativo's Sushi e Bar.
- DASHBOARD DA A VILA: tela diferente das operações. Não é tela de cadastro; é uma visão geral bem visual com indicadores (cards grandes de KPI, gráficos): faturamento total e por operação, margem gerencial vs meta 30%, CMV %, custos fixos, ponto de equilíbrio, comparativo Bora Burguer's x Nativo's Sushi x Bar, evolução mês a mês, alertas (operação abaixo da meta, produtos com preço abaixo do sugerido).

RECEITAS DA CASA (sub-receitas / preparos) - pedido principal do Kaic:
- Novo cadastro "Receitas da casa": nome, rendimento (quantidade + unidade, ex.: 1,2 kg ou 800 ml), perda %, itens (insumos ou outras receitas da casa + quantidade). Custo por unidade de rendimento calculado automaticamente (ex.: R$/g da maionese verde).
- Na ficha técnica dos pratos, cada item pode ser um insumo OU uma receita da casa. CMV do prato soma ambos. Mudar preço de um insumo propaga para as receitas da casa e depois para os pratos. Bloquear referência circular.
- Seeds: importar dados/cardapio/insumos.json (preço vazio = "preço pendente", destacar), receitas_base.json (sem quantidades: deixar itens sugeridos marcados como "confirmar") e pratos.json (preço praticado = preço do cardápio, ficha vazia/pendente), vinculados à operação certa (Bora Burguer's ou Nativo's Sushi). Mostrar indicador de "pendências" (insumos sem preço, fichas sem quantidade).
- Sem cardápio da A Vila: os pratos brasileiros estão no cardápio do Nativo's Sushi.
