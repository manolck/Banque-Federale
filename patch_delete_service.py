#!/usr/bin/env python3
"""Ajoute la suppression de services sur les fiches client (directeur / directeur adjoint)."""
from pathlib import Path
import sys

root = Path("/var/www/Banque-Federale")
index = root / "public" / "index.html"
route = root / "server_api" / "service_route.js"

if not index.exists():
    sys.exit(f"Introuvable: {index}")
if not route.exists():
    sys.exit(f"Introuvable: {route}")

text = index.read_text(encoding="utf-8")
backup = index.with_suffix(".html.bak_delete_service")
if not backup.exists():
    backup.write_text(text, encoding="utf-8")
    print(f"Sauvegarde: {backup}")

# 1) api helper
if "deleteService:" not in text:
    old_api = (
        "service:name=>call('/api/'+name+'?actualisation='+Date.now()), "
        "saveService:(name,body,method='POST')=>call('/api/'+name,{method,body:JSON.stringify(body)})"
    )
    new_api = (
        "service:name=>call('/api/'+name+'?actualisation='+Date.now()), "
        "saveService:(name,body,method='POST')=>call('/api/'+name,{method,body:JSON.stringify(body)}), "
        "deleteService:(name,id)=>call('/api/'+name,{method:'DELETE',body:JSON.stringify({id})})"
    )
    if old_api not in text:
        sys.exit("Bloc api.service introuvable dans index.html")
    text = text.replace(old_api, new_api, 1)
    print("api.deleteService ajoute")
else:
    print("api.deleteService deja present")

# 2) ClientDossier helpers
marker = (
    "async function deleteLoan(l){if(!confirm('Supprimer definitivement ce pret ?'))return;"
    "await api.deleteLoan(l.id);setLoans(loans.filter(x=>x.id!==l.id));notify('Pret supprime');setDesk(null);}"
)
# accents in source
marker = (
    "async function deleteLoan(l){if(!confirm('Supprimer définitivement ce prêt ?'))return;"
    "await api.deleteLoan(l.id);setLoans(loans.filter(x=>x.id!==l.id));notify('Prêt supprimé');setDesk(null);}"
)
if "async function deleteServiceContract" not in text:
    if marker not in text:
        sys.exit("deleteLoan introuvable dans ClientDossier")
    inject = marker + r"""
  const canDeleteService=canOpenDirection(me);
  async function deleteServiceContract(group,item,ev){
    ev?.stopPropagation?.();
    if(!canDeleteService) return;
    const label=item.ref||item.title||'ce dossier';
    if(!confirm('Supprimer définitivement '+label+' ?\nCette action est irréversible.')) return;
    try{
      if(group.kind==='loan'){
        await api.deleteLoan(item.id);
      }else if(group.kind==='life'){
        await api.deleteLifeInsurance({id:item.id,reason:'Suppression depuis fiche client',confirmation:'SUPPRIMER'});
      }else if(group.kind==='horse'){
        await api.deleteHorseCredit(item.id);
      }else if(group.kind==='service'&&group.service){
        await api.deleteService(group.service,item.id);
      }else{
        throw new Error('Type de service non supporté.');
      }
      notify('Service supprimé');
      onRefresh?.();
    }catch(e){notify('⚠ '+(e.message||e));}
  }"""
    text = text.replace(marker, inject, 1)
    print("deleteServiceContract ajoute")
else:
    print("deleteServiceContract deja present")

# 3) UI row
old_row = (
    "{group.items.map(item=><button type=\"button\" className={'vx-row '+(item.tone||'')} "
    "key={item.id} onClick={()=>setDesk({kind:group.kind,service:group.service,id:item.id})}>"
    "<div><b>{item.ref}</b><small>{item.title}</small></div>"
    "<span>{item.left}<br/>{item.leftLabel}</span>"
    "<span>{item.right}<br/>{item.rightLabel}</span>"
    "<div><b>{item.status}</b><small>{item.extra}</small></div></button>)}"
)
new_row = (
    "{group.items.map(item=><div key={item.id} className={'vx-row '+(item.tone||'')} "
    "style={{display:'flex',gap:10,alignItems:'center',justifyContent:'space-between'}}>"
    "<button type=\"button\" style={{flex:1,border:'none',background:'transparent',color:'inherit',"
    "textAlign:'left',cursor:'pointer',display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 1fr',gap:12,alignItems:'center'}} "
    "onClick={()=>setDesk({kind:group.kind,service:group.service,id:item.id})}>"
    "<div><b>{item.ref}</b><small>{item.title}</small></div>"
    "<span>{item.left}<br/>{item.leftLabel}</span>"
    "<span>{item.right}<br/>{item.rightLabel}</span>"
    "<div><b>{item.status}</b><small>{item.extra}</small></div></button>"
    "{canDeleteService&&<button type=\"button\" className=\"vx-btn quiet\" "
    "style={{color:'#ffb0a6',minWidth:96}} onClick={e=>deleteServiceContract(group,item,e)}>Supprimer</button>}"
    "</div>)}"
)
if "deleteServiceContract(group,item" in text and "canDeleteService&&" in text and "Supprimer</button>}" in text:
    print("UI suppression deja presente")
elif old_row in text:
    text = text.replace(old_row, new_row, 1)
    print("UI ligne service mise a jour")
else:
    sys.exit("Ligne group.items.map introuvable — structure HTML differente")

index.write_text(text, encoding="utf-8")
print("index.html OK")

# 4) service_route.js
rt = route.read_text(encoding="utf-8")
rt_backup = route.with_suffix(".js.bak_delete_service")
if not rt_backup.exists():
    rt_backup.write_text(rt, encoding="utf-8")
    print(f"Sauvegarde: {rt_backup}")

if "function canDeleteService" not in rt:
    old_imp = "const { sb, json, readBody, currentUser, hasPermission, logAction, handler } = require('./_lib');"
    new_imp = (
        "const { sb, json, readBody, currentUser, hasPermission, logAction, handler, roleCodeOf } = require('./_lib');\n\n"
        "const CAN_DELETE_SERVICE = new Set(['TECHNICIAN', 'DIRECTOR', 'DEPUTY_DIRECTOR']);\n"
        "function canDeleteService(actor) {\n"
        "  return CAN_DELETE_SERVICE.has(roleCodeOf(actor));\n"
        "}"
    )
    if old_imp not in rt:
        sys.exit("Import _lib introuvable dans service_route.js")
    rt = rt.replace(old_imp, new_imp, 1)
    print("canDeleteService ajoute")

if "req.method === 'DELETE'" not in rt and "req.method==='DELETE'" not in rt:
    needle = "    return json(res, 405, { error: 'Méthode non autorisée' });\n  });\n}"
    block = (
        "    if (req.method === 'DELETE') {\n"
        "      if (!canDeleteService(actor)) {\n"
        "        return json(res, 403, { error: 'Suppression réservée au directeur et au directeur adjoint.' });\n"
        "      }\n"
        "      const body = await readBody(req);\n"
        "      if (!body.id) return json(res, 400, { error: 'Dossier manquant.' });\n"
        "      const current = await sb.from(product.collection).select('*').eq('id', body.id).maybeSingle();\n"
        "      if (current.error) return json(res, 500, { error: current.error.message });\n"
        "      if (!current.data) return json(res, 404, { error: 'Dossier introuvable.' });\n"
        "      const removed = await sb.from(product.collection).delete().eq('id', body.id);\n"
        "      if (removed.error) return json(res, 500, { error: removed.error.message });\n"
        "      await sb.from('pret_service_events').insert({\n"
        "        service: name,\n"
        "        record_id: body.id,\n"
        "        event_type: 'deleted',\n"
        "        actor_username: actor.username,\n"
        "        dossier_number: current.data.dossier_number || current.data.contract_number || null\n"
        "      });\n"
        "      await logAction(actor, `suppression_${name}`, {\n"
        "        id: body.id,\n"
        "        dossier: current.data.dossier_number || null,\n"
        "        client: current.data.full_name || `${current.data.prenom || ''} ${current.data.nom || ''}`.trim() || null\n"
        "      });\n"
        "      return json(res, 200, { ok: true });\n"
        "    }\n\n"
        "    return json(res, 405, { error: 'Méthode non autorisée' });\n"
        "  });\n"
        "}"
    )
    if needle not in rt:
        sys.exit("Fin de service_route.js introuvable")
    rt = rt.replace(needle, block, 1)
    print("DELETE service_route ajoute")
else:
    print("DELETE service_route deja present")

route.write_text(rt, encoding="utf-8")
print("service_route.js OK")
print("Termine. Redemarre l'API Node puis recharge le navigateur (Ctrl+F5).")
