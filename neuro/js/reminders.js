import { trackAction } from './analytics.js?v=1.5.0';
import { CLOUD } from './config.js?v=1.5.0';
import { sheet } from './ui.js?v=1.5.0';
import { esc } from './util.js?v=1.5.0';
async function rpc(store,action,data={}){const r=await fetch(CLOUD.url+'/rest/v1/rpc/nz_reminders',{method:'POST',headers:{apikey:CLOUD.key,Authorization:'Bearer '+CLOUD.key,'Content-Type':'application/json'},body:JSON.stringify({p_token:store.session?.token,p_action:action,p_data:data}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('reminders_unavailable');return r.json();}
export function initReminders(store,{onOpen=()=>{}}={}){const opened=new URL(location.href);const kind=opened.searchParams.get('notification');if(['daily','return','continue'].includes(kind)){trackAction('notification_open_'+kind);opened.searchParams.delete('notification');history.replaceState(null,'',opened.pathname+opened.search+opened.hash);}
 navigator.serviceWorker?.addEventListener?.('message',event=>{if(event.data?.type==='neuro-reminder-open'){trackAction('notification_open_'+(event.data.kind||'daily'));onOpen();}});const touch=()=>{if(store.session?.token&&document.visibilityState==='visible')void rpc(store,'touch').catch(()=>{});};touch();document.addEventListener('visibilitychange',touch);setInterval(touch,300000);}
const ios=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
export function supportMessage(){if(ios()&&!matchMedia('(display-mode: standalone)').matches&&!navigator.standalone)return 'На iPhone сначала добавьте сайт на главный экран и откройте его с иконки. В браузере Instagram откройте сайт в Safari, затем «Поделиться → На экран Домой».';if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))return 'Этот браузер не поддерживает уведомления. Откройте приложение в Safari или Chrome на поддерживаемом устройстве.';if(Notification.permission==='denied')return 'Уведомления запрещены в настройках браузера. Разрешите их для этого сайта, затем вернитесь сюда.';return '';}
export async function openReminders(store){
 const s=sheet('<h3 class="sheet__title">Напоминания</h3><p role="status">Загружаем настройки…</p>');
 let prefs;try{prefs=await rpc(store,'get');}catch{s.node.innerHTML='<h3>Напоминания</h3><p>Не удалось загрузить настройки. Проверьте соединение и откройте этот раздел снова.</p><button class="btn" data-close>Закрыть</button>';s.node.querySelector('button').onclick=s.close;return;}
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Moscow';
 s.node.innerHTML='<h3 class="sheet__title">Напоминания о зарядке</h3><p class="sheet__text">Одно напоминание в выбранное время, если сегодня вы ещё не занимались. После трёх дней паузы — не чаще одного раза за три дня. После двух недель без активности отправка приостановится.</p><form data-reminder-form><label class="personal-custom">Время<input type="time" name="time" min="07:00" max="22:00" required value="'+esc(prefs.time)+'"></label><p class="reading-note">Часовой пояс: '+esc(zone)+'. Напоминания придут на это устройство.</p><p class="reading-note">'+esc(supportMessage())+'</p><p role="status" data-reminder-status>'+ (prefs.enabled?'Напоминания включены.':'Напоминания выключены.')+'</p><button class="btn btn--primary btn--block" type="submit">'+(prefs.enabled?'Сохранить время':'Включить напоминания')+'</button></form><button class="link" data-reminder-disable>Выключить напоминания</button><button class="link" data-close>Закрыть</button>';
 s.node.querySelector('[data-close]').onclick=s.close;
 const status=s.node.querySelector('[data-reminder-status]');
 s.node.querySelector('[data-reminder-disable]').onclick=async()=>{try{await rpc(store,'disable');try{const reg=await navigator.serviceWorker?.getRegistration();const sub=await reg?.pushManager?.getSubscription();if(sub)await sub.unsubscribe();}catch{}status.textContent='Напоминания выключены.';}catch{status.textContent='Не удалось выключить. Проверьте соединение и повторите.';}};
 s.node.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.target;if(!form.reportValidity())return;const message=supportMessage();if(message){status.textContent=message;return;}const button=form.querySelector('button');button.disabled=true;
 try{
  if(!prefs.public_key){status.textContent='Сервис напоминаний готовится. Откройте эти настройки немного позже.';return;}
  // Permission is requested only inside this explicit user action.
  const permission=await Notification.requestPermission();if(permission!=='granted'){status.textContent='Разрешение не получено. Напоминания не включены.';return;}
  const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
  if(!sub){const bytes=Uint8Array.from(atob(prefs.public_key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});}
  prefs=await rpc(store,'enable',{consent:true,time:form.elements.time.value,timezone:zone,subscription:sub.toJSON()});status.textContent='Готово. Напомним в '+prefs.time+', если сегодня вы ещё не занимались.';
 }catch{status.textContent='Не удалось включить напоминания. Проверьте соединение и попробуйте ещё раз.';}finally{button.disabled=false;}
 };
}
