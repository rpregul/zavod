export function allowedEndpoint(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(u.hostname==='fcm.googleapis.com'||u.hostname==='web.push.apple.com'||/^[a-z0-9-]+\.push\.services\.mozilla\.com$/.test(u.hostname)||/^[a-z0-9.-]+\.notify\.windows\.com$/.test(u.hostname));}catch{return false;}}
export function createReminderHandler({env,webpush,fetch:request=globalThis.fetch}){
 const url=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY');
 async function rpc(action,data={}){const r=await request(url+'/rest/v1/rpc/nz_reminder_worker',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_data:data}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('worker_database');return r.json();}
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 return async req=>{
  try{
   if(req.method==='GET'){const config=await rpc('config');return reply({ready:!!config.public_key});}
   if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
   const token=req.headers.get('x-job-token')||'';if(!/^[a-f0-9]{64}$/.test(token)||!(await rpc('auth',{token})).ok)return reply({error:'unauthorized'},401);
   let config=await rpc('config');if(!config.public_key){const keys=webpush.generateVAPIDKeys();config=await rpc('initialize',{public_key:keys.publicKey,private_key:keys.privateKey});}
   const body=await req.json().catch(()=>({}));
   if(body.self_test===true){const peer=webpush.generateVAPIDKeys();const details=webpush.generateRequestDetails({endpoint:'https://fcm.googleapis.com/fcm/send/self-test',keys:{p256dh:peer.publicKey,auth:'A'.repeat(22)}},'{}',{vapidDetails:{subject:'mailto:plotnikov.csh@gmail.com',publicKey:config.public_key,privateKey:config.private_key},TTL:900});return reply({encrypted:details.body?.length>0});}
   const rows=await rpc('claim');let sent=0,failed=0;
   const deliver=async row=>{
    if(!allowedEndpoint(row.subscription?.endpoint)){await rpc('finish',{id:row.id,user_key:row.user_key,status:'gone'});failed++;return;}
    try{
     const details=webpush.generateRequestDetails(row.subscription,JSON.stringify({title:'Нейро-зарядка',body:row.body,url:'https://plotnikovprod.ru/neuro/?notification='+row.kind,tag:'neuro-training',kind:row.kind}),{vapidDetails:{subject:'mailto:plotnikov.csh@gmail.com',publicKey:config.public_key,privateKey:config.private_key},TTL:900,urgency:'normal',timeout:10000,topic:'neuro-training'});
     const delivery=await request(details.endpoint,{method:details.method,headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(10000)});
     if(!delivery.ok){const error=new Error('push_rejected');error.statusCode=delivery.status;throw error;}
     sent++;await rpc('finish',{id:row.id,user_key:row.user_key,status:'sent'});
    }catch(error){failed++;await rpc('finish',{id:row.id,user_key:row.user_key,status:[404,410].includes(error.statusCode)?'gone':'failed'});}
   };
   for(let offset=0;offset<rows.length;offset+=10)await Promise.all(rows.slice(offset,offset+10).map(deliver));
   return reply({sent,failed});
  }catch{return reply({error:'temporarily_unavailable'},503);}
 };
}
