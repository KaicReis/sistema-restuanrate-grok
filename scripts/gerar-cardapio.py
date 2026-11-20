import json, re, unicodedata
from pathlib import Path
ins=json.load(open('dados/cardapio/insumos.json'))['insumos']; rec=json.load(open('dados/cardapio/receitas_base.json'))['receitas_base']; pratos=json.load(open('dados/cardapio/pratos.json'))['pratos']
ops=lambda n:'bora' if 'Bora' in n else 'nativos'
ready=['coxinha','pastel','guioza','harumaki','rolinho primavera','picles','gengibre em conserva','gari']
isready=lambda n:any(x in n.lower() for x in ready)
norm=lambda v: ''.join(c for c in unicodedata.normalize('NFD',v.lower()) if unicodedata.category(c)!='Mn')
refs={op:[] for op in ['bora','nativos']}
for p in pratos:refs[ops(p['restaurante'])]+=p.get('ingredientes_mencionados',[])
for r in rec:
 for op in [ops(n) for n in r['restaurantes']]:refs[op]+=[i['nome'] for i in r['insumos']]
def contem(termo, texto):
 return bool(re.search(r"(?<!\w)" + re.escape(norm(termo)) + r"(?!\w)", norm(texto)))
def destinos(i):
 matched=[op for op,vs in refs.items() if any(contem(i['nome'], v) or contem(v, i['nome']) for v in vs)]
 return ['bora','nativos'] if i['categoria']=='embalagem' else matched or ['nativos']
rows=[]; recipes=[]; products=[]
for op in ['bora','nativos']:
 for idx,i in enumerate(ins):
  if op not in destinos(i):continue
  rows.append(dict(id=f'seed-{op}-i{idx}',restaurante_id=op,nome=i['nome'],unidade=i['unidade_compra_sugerida'] if i['unidade_compra_sugerida'] in ['kg','g','L','ml','un'] else 'un',quantidade=1,preco=0,rendimento=100,precoPendente=True,categoria=i['categoria']))
 for idx,r in enumerate(rec):
  if op not in [ops(n) for n in r['restaurantes']]:continue
  if isready(r['nome']):
   rows.append(dict(id=f'seed-{op}-pronto{idx}',restaurante_id=op,nome=r['nome'],unidade='un',quantidade=1,preco=0,rendimento=100,precoPendente=True));continue
  itens=[]
  if r['nome'] not in ['Maionese verde','Farofa de bacon','Blend de hambúrguer']:
   for i in r['insumos']:
    match=next((x for x in rows if x['restaurante_id']==op and x['nome'].lower()==i['nome'].lower()),None)
    if not match:
     match=dict(id=f'seed-{op}-extra{idx}-{len(itens)}',restaurante_id=op,nome=i['nome'],unidade='un',quantidade=1,preco=0,rendimento=100,precoPendente=True);rows.append(match)
    itens.append(dict(insumo_id=match['id'],quantidade=0,perda=0,confirmar=True))
  recipes.append(dict(id=f'seed-{op}-r{idx}',restaurante_id=op,nome=r['nome'],rendimento=0,unidade='g',perda=0,itens=itens,pendente=True,notas=r.get('observacao','')+' Composição e rendimento a confirmar pelo dono.'))
for idx,p in enumerate(pratos):products.append(dict(id=f'seed-p{idx}',restaurante_id=ops(p['restaurante']),nome=p['nome'],rendimento=1,itens=[],embalagem=0,pendente=True,precoCardapio=round(p['preco']*100),notas=' · '.join(filter(None,[p.get('descricao'),p.get('notas'), 'Confirmar ficha e quantidades.']))))
for size in ['VM','VG']:rows.append(dict(id=f'seed-nativos-camarao-{size}',restaurante_id='nativos',nome=f'Camarão {size}',unidade='kg',quantidade=1,preco=0,rendimento=100,precoPendente=True))
Path('src/lib/storage/cardapio.json').write_text(json.dumps(dict(insumos=rows,receitas=recipes,produtos=products),ensure_ascii=False,indent=2))
