import { openFunnel as openOriginal } from './analytics.js?v=1.5.0';
import { CLOUD } from './config.js?v=1.5.0';
import { esc } from './util.js?v=1.5.0';
export async function openFunnel(store){
 await openOriginal(store);
 const overlay=document.querySelector('.analytics-overlay'),host=overlay?.querySelector('[data-report]');if(!host)return;
 const title=[...host.querySelectorAll('b')].find(n=>n.textContent==='Новые посетители после переноса регистрации');
 if(title)title.textContent='Воронка новых посетителей с 11 ноября';
 const old=[...host.querySelectorAll('b')].find(n=>n.textContent==='Вся история участников');
 if(old){const details=document.createElement('details');details.className='analytics-archive';const summary=document.createElement('summary');summary.textContent='Архив: участники за всё время';details.append(summary);old.before(details);let n=old;for(let i=0;i<4&&n;i++){const next=n.nextSibling;details.append(n);n=next;}old.remove();}
 const panel=document.createElement('section');panel.className='traffic-panel';panel.innerHTML='<h3>Посещения</h3><p class="reading-note">Загружаем графики…</p>';host.prepend(panel);
 let selected=null,busy=false,timer;
 async function load(){if(busy||!panel.isConnected)return;busy=true;try{
 const response=await fetch(CLOUD.url+'/rest/v1/rpc/nz_traffic_report',{method:'POST',headers:{apikey:CLOUD.key,Authorization:'Bearer '+CLOUD.key,'Content-Type':'application/json'},body:JSON.stringify({p_token:store.session.token,p_day:selected}),signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(!response.ok)throw Error();const data=await response.json();if(!panel.isConnected)return;selected=data.day;
 const fmt=d=>new Date(d+'T12:00:00+03:00').toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});
 const daily=data.daily||[],now=daily.find(r=>r.day===data.today),previous=daily.find(r=>r.day===shiftDay(data.today,-1));

 panel.innerHTML='<h3>Посещения за 14 дней</h3><p>Сегодня: <b>'+(now?.visitors||0)+'</b> · новых: <b>'+(now?.new_visitors||0)+'</b>'+' · вчера: <b>'+(previous?.visitors||0)+'</b>'+'</p><small>Сегодняшний день ещё идёт. Листайте график вбок; нажмите день, чтобы увидеть часы.</small>'+bars(daily.map(r=>({label:fmt(r.day),value:data.tracking_started&&r.day>=data.tracking_started.slice(0,10)?r.visitors:null,key:r.day,selected:r.day===selected})),false)
 +'<h3>По часам · '+fmt(selected)+' (МСК)</h3>'+bars((data.hourly||[]).map(r=>({label:String(r.h).padStart(2,'0'),value:data.campaign&&new Date(selected+'T'+String(r.h).padStart(2,'0')+':59:59+03:00')>=new Date(data.campaign.hourly_started)&&new Date(selected+'T'+String(r.h).padStart(2,'0')+':00:00+03:00')<=new Date(data.measured_at)?r.visitors:null})),true)
 +'<p class="reading-note">«—» означает: нет данных или час ещё не наступил. Число уникальных посетителей за каждый день и час. До входа считаем браузер, после входа объединяем по профилю. Один посетитель может быть в нескольких часах и днях — столбцы не суммируются. Владелец и тесты исключены. Данные до начала счётчика не восстанавливаются.</p>'
 +(data.campaign?'<p class="reading-note">Точный учёт по часам начат '+new Date(data.campaign.hourly_started).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК. Более ранние часы — нет данных.</p><details class="analytics-archive"><summary>Срез перед анонсом · 13 ноября</summary><p>Новые посетители: '+data.campaign.baseline.funnel.visitors+'; начали: '+data.campaign.baseline.funnel.trial_started+'; завершили: '+data.campaign.baseline.funnel.trial_completed+'; нажали оплатить: '+data.campaign.baseline.funnel.checkout_submitted+'; реальные покупки: '+data.campaign.baseline.funnel.buyers+'.</p></details>':'')
 +'<small>Обновлено '+new Date(data.measured_at).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'})+' МСК · графики обновляются раз в минуту</small><button class="link" data-traffic-refresh>Обновить графики</button><hr>';
 const scrolls=panel.querySelectorAll('.traffic-scroll');scrolls[0].scrollLeft=scrolls[0].scrollWidth;const hour=new Date(data.measured_at).getUTCHours()+3;scrolls[1].scrollLeft=Math.max(0,(hour%24-3)*36);
 panel.querySelectorAll('[data-traffic-day]').forEach(b=>b.onclick=()=>{selected=b.dataset.trafficDay;void load();});panel.querySelector('[data-traffic-refresh]').onclick=()=>void load();
 }catch{if(panel.isConnected)panel.innerHTML='<h3>Посещения</h3><p>Не удалось загрузить графики.</p><button class="btn" data-traffic-retry>Повторить</button>';panel.querySelector('[data-traffic-retry]')?.addEventListener('click',()=>void load());}finally{busy=false;}}
 await load();timer=setInterval(()=>{if(!panel.isConnected){clearInterval(timer);return;}if(document.visibilityState==='visible')void load();},60000);
}
function shiftDay(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function bars(rows,hourly){const max=Math.max(1,...rows.map(r=>r.value||0));return '<div class="traffic-scroll" tabindex="0" aria-label="'+(hourly?'Посетители по часам':'Посетители по дням')+'"><div class="traffic-bars '+(hourly?'traffic-bars--hours':'')+'">'+rows.map(r=>'<'+(r.key?'button type="button" data-traffic-day="'+esc(r.key)+'" aria-pressed="'+!!r.selected+'"':'div')+' class="traffic-bar"><b>'+(r.value===null?'—':r.value)+'</b><span><i style="height:'+Math.max(0,r.value/max*100)+'%"></i></span><small>'+esc(r.label)+'</small></'+(r.key?'button':'div')+'>').join('')+'</div></div>';}
