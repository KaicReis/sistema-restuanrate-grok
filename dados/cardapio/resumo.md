# Cardápios — extração para cadastro de insumos e receitas da casa

Gerado em 14/11/2026, 18:30 (America/Sao_Paulo), a partir dos dois PDFs enviados pelo Kaic.

## Menus encontrados

1. **Nativo's Sushi Delivery** (PDF de 6 páginas, Canva, 21/09/2026). Capa com Instagram `nativos.sushi` e telefone `(73) 98253-8180`. Inclui sushi (combinados, temaki, niguiri, gunkan, hossomaki, sashimi, joy, uramaki, hots, poke, oniguiri) e também pratos quentes brasileiros (massas, petiscos, combos, principais, risotos, yakissoba, acompanhamentos e bebidas).
2. **Bora Burguer's** (PDF de 1 página, Canva, 03/11/2026, autor Kaic Reis). Hambúrgueres, milkshakes e adicionais.

**A Vila não aparece em nenhum dos dois PDFs.** Se o sistema da A Vila tiver cardápio próprio, ainda falta esse arquivo.

O catálogo Anota AI de 05/11/2026 (já existente no workspace) foi usado apenas como apoio em notas: descrições mais completas, itens que não estão nestes PDFs e diferenças de preço. A descrição verbatim e o preço de cada prato vêm destes PDFs.

## Contagens

| Arquivo | Quantidade |
|---|---|
| Pratos (`pratos.json`) | **113** (18 da Bora Burguer's + 95 do Nativo's Sushi) |
| Insumos deduplicados (`insumos.json`) | **106** (todos com `preco: null`) |
| Receitas da casa (`receitas_base.json`) | **43** |

### Pratos da Bora Burguer's por categoria

- Hambúrgueres: 6
- Milkshakes: 5
- Adicionais: 7

### Pratos do Nativo's Sushi por categoria

- Combinados: 6
- Temaki: 5
- Niguiri: 6
- Gunkan: 3
- Hossomaki: 3
- Sashimi: 3
- Joy: 5
- Uramaki: 5
- Hots: 3
- Poke: 1
- Oniguiri: 1
- Guioza: 3
- Rolinho primavera: 3
- Porção extra: 3
- Massas: 2
- Petiscos: 10
- Combo: 3
- Principais: 8
- Risotos: 5
- Yakissoba: 4
- Acompanhamentos: 4
- Bebidas: 9

### Insumos por categoria

- proteína: 19
- hortifruti: 20
- laticínio: 13
- mercearia: 41
- padaria: 2
- bebida: 10
- embalagem: 1

### Insumos por origem da informação

- mencionado no cardápio: 61
- mencionado no catálogo Anota AI de 05/11/2026, não impresso nestes PDFs: 4
- sugestão para receita da casa (confirmar com Kaic): 32
- implícito típico da preparação (sugestão, confirmar com Kaic): 9

## Lista das receitas da casa (preparos / sub-receitas)

São os preparos feitos na casa a partir de insumos, para depois entrar nos pratos — exatamente o ponto que o Kaic levantou (ex.: maionese verde). Os ingredientes de cada um estão marcados como **sugestão, confirmar com Kaic**. Sem quantidades e sem preços.

- **Maionese verde** — usada em: X Salada, X Burguer 2.0, X Bacon 2.0, Nativo's, Chicken, Adicional de molhos (se a maionese verde estiver entre os molhos — confirmar)
- **Creme cheddar** — usada em: X Bacon 2.0
- **Farofa de bacon** — usada em: X Bacon 2.0
- **Crispy de cebola** — usada em: X Burguer 2.0
- **Costela desfiada** — usada em: Nativo's
- **Creme de gorgonzola** — usada em: Franklyn
- **Cebola caramelizada** — usada em: Franklyn
- **Blend de hambúrguer** — usada em: X Salada (150g), X Burguer 2.0 (120g), X Bacon 2.0 (120g), Franklyn (150g), Nativo's (150g), Adicional blend 150g, Adicional blend de 120g
- **Frango empanado** — usada em: Chicken
- **Base de milkshake** — usada em: Milkshake Ovomaltine, Milkshake Nutella, Milkshake Ninho, Milkshake Paçoca, Milkshake Morango
- **Picles de pepino** — usada em: Adicional de picles
- **Arroz de sushi (shari)** — usada em: Todos os combinados, Temaki Philadelphia (todas as opções), Temaki Hot, Niguiri (todas as opções), Gunkan (todas as opções), Hossomaki (todas as opções), Joy (todas as opções), Uramaki (todas as opções)…
- **Molho tarê** — usada em: Niguiri maçaricado, Joy maçaricado, Joy de camarão maçaricado, Combinado Patimirim (joy e niguiri maçaricados), Possivelmente alguns hots — confirmar
- **Sunomono de pepino** — usada em: Sunomono de pepino
- **Gengibre em conserva (gari)** — usada em: Gengibre (porção extra), Acompanha o sushi em geral (não escrito no PDF)
- **Empanamento** — usada em: Frango empanado (Chicken), Temaki Hot (se for empanado — confirmar), Hot Filadélfia, Hot de camarão, Hot Ball, Camarão VG empanado, Isca de frango (se empanada), Isca de peixe (se empanada)…
- **Molho branco** — usada em: Massa de camarão ao molho branco
- **Molho sugo** — usada em: Massa ao sugo
- **Molho de alcaparras** — usada em: Salmão ao molho de alcaparras
- **Molho madeira** — usada em: Filé mignon ao molho madeira
- **Molho de camarão** — usada em: Filé de peixe ao molho de camarão
- **Strogonoff** — usada em: Strogonoff de frango, Strogonoff de carne
- **Parmegiana** — usada em: Parmegiana de frango, Parmegiana de contra-filé
- **Bobó de camarão** — usada em: Bobó de camarão
- **Purê de batata** — usada em: Purê de batata (acompanhamento), Salmão ao molho de alcaparras, Filé mignon ao molho madeira
- **Risoto base** — usada em: Risoto de carne de sol, Risoto de camarão com siciliano, Risoto de filé mignon, Risoto de shitake, Risoto de polvo
- **Yakisoba** — usada em: Yakissoba de carne, Yakissoba de frango, Yakissoba de camarão, Yakissoba de shitaki
- **Batata frita** — usada em: Batata frita (petisco), Parmegiana de frango, Parmegiana de contra-filé, Combo Mirante (fritas)
- **Batata à dorê** — usada em: Filé de peixe ao molho de camarão
- **Aipim frito** — usada em: Aipim frito (petisco), Carne de sol, Combo Rio da Barra, Combo Rio Verde
- **Coxinha** — usada em: Combo Mirante, Combo Rio da Barra, Combo Rio Verde
- **Tulipa de frango** — usada em: Combo Rio da Barra
- **Massa de pastel** — usada em: Pastel de carne seca com cream cheese, Pastel de queijo, Pastel de camarão
- **Guioza** — usada em: Guioza suína, Guioza bovina, Guioza de legumes
- **Rolinho primavera / harumaki** — usada em: Harumaki de salmão, Romeu e Julieta, Banana com doce de leite
- **Farofa** — usada em: Farofa (acompanhamento)
- **Feijão** — usada em: Feijão (acompanhamento)
- **Arroz branco** — usada em: Arroz (acompanhamento), Salmão ao molho de alcaparras, Strogonoff de frango, Strogonoff de carne, Filé mignon ao molho madeira, Parmegiana de frango, Parmegiana de contra-filé, Filé de peixe ao molho de camarão…
- **Isca de frango** — usada em: Isca de frango
- **Isca de peixe** — usada em: Isca de peixe
- **Camarão empanado** — usada em: Camarão VG empanado, Combo Rio da Barra
- **Frango frito** — usada em: Combo Mirante
- **Carne de sol (preparo da casa)** — usada em: Carne de sol (petisco, com aipim e queijo coalho), Combo Mirante, Combo Rio Verde, Risoto de carne de sol

## Itens e dúvidas para o Kaic confirmar

### 1. A Vila e o que ficou de fora destes PDFs
- Qual é o cardápio da **A Vila**? Ele não está nestes dois arquivos. Os pratos brasileiros (parmegiana, bobó, strogonoff, carne de sol, etc.) estão no PDF do **Nativo's Sushi Delivery**. É tudo da mesma cozinha, ou falta o cardápio da A Vila?
- No catálogo Anota AI de 05/11/2026 há itens que **não estão nestes PDFs**, por exemplo:
  - Bora: lanches **Original** e **Duplo Smash**, **batata frita pequena**, e a lista de bebidas (o PDF da Bora só tem milkshakes).
  - Nativo's delivery: **porção extra de arroz shari**.
  - Só no salão: ceviche, casquinha de siri, patinha de caranguejo, dadinho de tapioca, tartar de salmão, sunomono de polvo com kani, strogonoff de camarão, contra-filé na pedra, prato kids, saladas, petit gâteau, drinks, doses, vinhos, cervejas 600 ml etc.
- Os preços da Bora nestes PDFs estão **mais altos** do que no Anota AI de 05/11 (ex.: X Salada R$ 44,00 vs. R$ 37,00; Chicken R$ 39,00 vs. R$ 23,90; X Burguer 2.0 R$ 36,00 vs. X-Burguer R$ 24,90). Usamos os preços impressos agora. Qual lista vale para o sistema?
- No catálogo, Franklyn e Nativo's saíam **com batata frita**; neste PDF a batata não aparece na descrição. A versão 2.0 tirou a batata?

### 2. Siglas, porções e nomes ambíguos
- O que é **camarão VM** e **camarão VG**? Hipótese (não usar ainda): médio e grande, ou vermelho médio/grande.
- **Combo Rio Verde** vem com **“60 UN”** no PDF, o que é estranho para carne de sol + linguiça + aipim + coxinha. É isso mesmo? No Anota AI a descrição ainda incluía **esfiha**, que não está neste PDF.
- Combo Rio da Barra: o PDF diz **coxinha**; o Anota AI dizia **salgado**. Qual vale?
- **Tulipa** do Rio da Barra é tulipa de frango?
- **Long neck** do delivery: quais marcas? (No salão do Anota AI, a R$ 15,00: Corona, Heineken, Praya e Budweiser.)
- **Suco 300 ml**: quais sabores de polpa estão disponíveis?
- **Tônica** e **guaraná**: quais marcas?
- **Peixe branco** e **filé de peixe** / **isca de peixe**: qual espécie? É o mesmo peixe?
- **Carne de sol** e **carne seca** do pastel são o mesmo produto?
- **Feijão**: qual tipo?
- **Massa ao sugo** e **massa de camarão**: qual massa? (No salão do Anota AI aparece espaguete.) A massa ao sugo leva proteína?
- No X Burguer 2.0 o PDF junta **“QUEIJO CHEDDAR CRISPY DE CEBOLA”** sem vírgula. Interpretamos como queijo cheddar + crispy de cebola. Confirma?

### 3. Peças de sushi sem receita escrita
O PDF quase só coloca o nome da proteína. Para cadastrar a ficha técnica de verdade, precisamos da receita de:
- **Joy** (salmão, atum, vegano, maçaricado) — formato e recheios (leva cream cheese? nori?).
- **Joy / niguiri veganos** e as peças do combinado **Espelho (Vegano)**.
- **Uramaki Califórnia** — recheio. Atenção: ele entra no combinado **vegano** Espelho; o Califórnia clássico em geral leva kani (não vegano). Qual é a versão da casa?
- **Dragon Orange** — recheio e o que é o “orange”.
- **Hot Filadélfia**, **Hot de camarão**, **Hot Ball**, **Temaki Hot** — recheios e se são empanados.
- **Temaki Philadelphia**: o nome sugere cream cheese, mas o PDF não escreve. Confirma? O adicional de **R$ 10,00 sem arroz** vale só para o Hot ou também para o Philadelphia?
- **Gunkan**: só o peixe, ou leva cream cheese, ovas ou outro topping?
- **Niguiri Mix**: sem texto neste PDF; no Anota AI era “Polvo, Mix de Peixes e Ovas”. Vale essa composição?
- **Combinados Taípe, Trancoso, Caraíva e Quadrado**: o PDF não diz o peixe de cada peça. No Anota AI, a arte do gestor diz que acompanham **salmão, atum, peixe-branco, polvo, camarão e ovas**. Podemos usar isso nas fichas?
- **Monte seu poke**: o PDF manda “verificar opções no link”. Quais são as bases, proteínas e adicionais?
- **Oniguiri de salmão**: só salmão e arroz, ou leva nori / cream cheese?
- **Uramaki de salmão e de atum**: neste PDF não há descrição; no Anota AI levam **gergelim branco e preto** e **cream cheese**. Confirma?

### 4. Receitas da casa — o que confirmar antes de cadastrar
- Composição da **maionese verde** (ovos, óleo, quais ervas, alho, limão, mostarda?).
- O **blend** é moído e porcionado na casa? Quais cortes? Só 120 g e 150 g?
- **Farofa de bacon**: farofa com farinha de mandioca ou bacon crocante triturado?
- **Creme cheddar**, **creme de gorgonzola**, **crispy de cebola**, **cebola caramelizada**, **costela desfiada**: confirmar insumos.
- **Picles** e **gari / wasabi**: feitos na casa ou comprados prontos?
- **Coxinha**, **massa de pastel**, **guioza**, **harumaki**: feitos na casa ou comprados prontos?
- **Bobó**: usa aipim, leite de coco e dendê?
- **Strogonoff**: creme de leite, ketchup, molho inglês, champignon?
- **Yakisoba**: quais legumes e qual molho?
- **Farofa** de acompanhamento: o que leva?
- **Empanamento**: a casa usa o mesmo padrão (farinha, ovo, farinha de rosca/panko) para frango, peixe, camarão, hots e parmegiana?
- **Adicionais da Bora**: quais molhos, qual queijo e o que entra em “saladas”?
- **Milkshakes**: a base é sorvete, leite, ou outra? O de morango usa fruta, polpa ou calda?

### 5. Embalagens
- Estes PDFs não listam embalagens. O Anota AI tem “Embalagem delivery” a R$ 5,00. Para o CMV fechar, precisamos da lista real (pote de sushi, marmita, copo de milkshake, sacola, hashi, molheira, etc.).

## Arquivos gerados

- `/workspace/restaurante/cardapio/pratos.json`
- `/workspace/restaurante/cardapio/insumos.json`
- `/workspace/restaurante/cardapio/receitas_base.json`
- `/workspace/restaurante/cardapio/resumo.md`

Nenhuma quantidade de ficha técnica e nenhum preço de insumo foram inventados.
