const { sb, json, readBody, currentUser, hasPermission, logAction, handler, roleCodeOf } = require('./_lib');

const CAN_DELETE_CLIENT = new Set(['TECHNICIAN', 'DIRECTOR', 'DEPUTY_DIRECTOR']);
function canDeleteClient(actor) {
  return CAN_DELETE_CLIENT.has(roleCodeOf(actor));
}

const TEXT_FIELDS = [
  'nom','prenom','telegram','adresse','notes','carte_identite_url',
  'civilite','date_naissance','nationalite','statut_residentiel','details_dettes',
  'statut_emploi','statut_emploi_autre','date_embauche','entreprise',
  'chef_entreprise','telegram_chef','profession','salaire_hebdomadaire'
];

function text(value){
  return String(value ?? '').trim();
}
function clientKind(value){
  return String(value || '').trim().toLowerCase() === 'entreprise' ? 'entreprise' : 'personne';
}
function payloadFrom(body){
  const payload={};
  for(const key of TEXT_FIELDS){
    if(body[key] !== undefined) payload[key]=text(body[key]);
  }
  if(body.kind !== undefined || body.client_type !== undefined) {
    payload.kind = clientKind(body.kind || body.client_type);
  }
  if(body.a_autres_dettes !== undefined) payload.a_autres_dettes=!!body.a_autres_dettes;
  return payload;
}

async function nextClientNumber(){
  const { data, error } = await sb.from('pret_clients').select('*');
  if(error) throw new Error(error.message);
  let max = 0;
  for(const row of data || []){
    const value = Number(row.legacy_id);
    if(Number.isInteger(value) && value > max) max = value;
  }
  return max + 1;
}

module.exports = (req,res)=>handler(req,res, async()=>{
  const actor = await currentUser(req);
  if(!actor) return json(res,401,{error:'Non connecté'});
  if(req.method==='GET' && !hasPermission(actor,'bank.read')) return json(res,403,{error:'Accès refusé'});
  if(req.method!=='GET' && !hasPermission(actor,'bank.write')) return json(res,403,{error:'Modification refusée'});

  if(req.method==='GET'){
    const { data, error } = await sb
      .from('pret_clients')
      .select('*')
      .order('created_at',{ascending:false});

    if(error) return json(res,500,{error:error.message});
    return json(res,200,data || []);
  }

  if(req.method==='POST'){
    const body = await readBody(req);
    const payload=payloadFrom(body);
    payload.kind = clientKind(payload.kind || body.kind || body.client_type);
    if(payload.kind === 'entreprise'){
      if(!payload.nom) return json(res,400,{error:"Le nom de l'entreprise est requis"});
      payload.prenom = payload.prenom || '';
      payload.entreprise = payload.entreprise || payload.nom;
    }else if(!payload.nom || !payload.prenom){
      return json(res,400,{error:'Nom et prénom requis'});
    }
    payload.legacy_id = await nextClientNumber();

    const { data, error } = await sb.from('pret_clients').insert(payload).select().single();
    if(error) return json(res,500,{error:error.message});

    await logAction(actor,'creation_client',{
      client_id:data.id,
      kind:data.kind || 'personne',
      client:data.kind === 'entreprise' ? data.nom : `${data.prenom} ${data.nom}`
    });
    return json(res,200,data);
  }

  if(req.method==='PUT'){
    const body=await readBody(req);
    if(!body.id) return json(res,400,{error:'ID manquant'});

    const patch=payloadFrom(body);
    if(Object.keys(patch).length===0) return json(res,400,{error:'Aucune information à modifier'});
    if(patch.kind === 'entreprise'){
      if(patch.nom !== undefined && !patch.nom) return json(res,400,{error:"Le nom de l'entreprise est requis"});
      if(patch.nom) patch.entreprise = patch.entreprise || patch.nom;
      if(patch.prenom === undefined) patch.prenom = '';
    }else if(patch.kind === 'personne' || patch.nom !== undefined || patch.prenom !== undefined){
      const current = await sb.from('pret_clients').select('*').eq('id',body.id).maybeSingle();
      if(current.error) return json(res,500,{error:current.error.message});
      const next = { ...(current.data || {}), ...patch };
      const kind = clientKind(next.kind);
      if(kind !== 'entreprise' && (!next.nom || !next.prenom)) {
        return json(res,400,{error:'Nom et prénom requis'});
      }
    }

    const { data, error } = await sb
      .from('pret_clients')
      .update(patch)
      .eq('id',body.id)
      .select()
      .single();

    if(error) return json(res,500,{error:error.message});

    await logAction(actor,'modification_client',{
      client_id:data.id,
      kind:data.kind || 'personne',
      client:data.kind === 'entreprise' ? data.nom : `${data.prenom} ${data.nom}`,
      fields:Object.keys(patch)
    });
    return json(res,200,data);
  }

  if(req.method==='DELETE'){
    if(!canDeleteClient(actor)) {
      return json(res,403,{error:'Suppression réservée au directeur, au directeur adjoint et au technicien.'});
    }
    const { id } = await readBody(req);
    if(!id) return json(res,400,{error:'ID manquant'});

    const { data:client } = await sb.from('pret_clients').select('*').eq('id',id).maybeSingle();
    const { error } = await sb.from('pret_clients').delete().eq('id',id);
    if(error) return json(res,500,{error:error.message});

    await logAction(actor,'suppression_client',{
      client_id:id,
      client:client?`${client.prenom} ${client.nom}`:null
    });
    return json(res,200,{ok:true});
  }

  return json(res,405,{error:'Méthode non autorisée'});
});
