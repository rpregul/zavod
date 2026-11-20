import { CLOUD } from './config.js?v=1.5.0';
import { esc } from './util.js?v=1.5.0';

const buttons = {
  header:'В шапке', hero:'На первом экране', synapse:'Под схемой нейронов',
  how:'После «Как тренироваться»', review:'После отзыва', final:'В последнем блоке'
};
const steps = [
  ['visitors','Посетили'],['clicked','Нажали кнопку тренажёра'],['arrived','Открыли тренажёр'],
  ['trial_started','Начали пробную'],['trial_completed','Сохранили 4 результата'],
  ['summary_seen','Открыли итоги'],['offer_seen','Увидели тарифы'],
  ['plan_selected','Выбрали тариф'],['checkout_submitted','Нажали оплатить'],
  ['buyers','Оплатили'],['profile_created_after_payment','Создали профиль после оплаты']
];
const sections = {
  hero:'Первый экран', effects:'Эффект от занятий', reading:'Скорочтение с пониманием', audience:'Кому полезен',
  synapse:'Схема нейронов', how:'Как тренироваться', review:'Отзыв', demo:'Демонстрация чтения', final:'Бесплатная тренировка'
};
const interactions = {
  land_warmup_start:'Начали разминку', land_warmup_complete:'Завершили разминку',
  land_usual_auto:'Обычное чтение запустилось автоматически', land_usual_manual:'Запустили обычное чтение кнопкой',
  land_usual_complete:'Досмотрели обычное чтение', land_focus_start:'Запустили чтение по словам',
  land_focus_complete:'Дочитали упражнение по словам'
};
const controls = {
  land_brand:'Логотип',land_age_young:'Возраст · младший',land_age_adult:'Возраст · средний',land_age_senior:'Возраст · пожилой',
  land_signal:'Запустить сигнал',land_review_image:'Открыть скриншот отзыва',land_tab_usual:'Вкладка обычного чтения',
  land_tab_focus:'Вкладка концентрированного чтения',land_usual_play:'Управление обычным чтением',
  land_focus_play:'Управление чтением по словам',land_speed:'Ползунок скорости',land_warmup_tile:'Число в разминке',
  land_warmup_reset:'Повтор разминки',land_offer:'Условия доступа',land_privacy:'Персональные данные'
};
const percent = (n,d) => d ? (100*n/d).toLocaleString('ru-RU',{maximumFractionDigits:2})+'%' : '—';
const count = n => Number(n || 0).toLocaleString('ru-RU');
const secs = n => n == null ? '—' : count(Math.round(n/1000))+' с';
const date = s => new Date(s).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'});

function table(headers, rows) {
  return '<div style="overflow-x:auto"><table><thead><tr>'+headers.map(s=>'<th scope="col">'+esc(s)+'</th>').join('')+
    '</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+esc(String(cell))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function funnel(data, landing) {
  return table(['Этап','Посетители','От всех','От предыдущего'],steps.filter(([id])=>landing||!['clicked','arrived'].includes(id)).map(([id,label],i,all)=>{
    const n=data[id]||0;
    // Visibility and click markers are independent. Their ratios describe aggregate counts.
    return [label,count(n),percent(n,data.visitors),i?percent(n,data[all[i-1][0]]):'—'];
  }));
}

export async function loadLandingReport(host, token) {
  host.innerHTML = '<h3>Лендинг и покупка</h3><p>Загружаем…</p>';
  try {
    const response=await fetch(CLOUD.url+'/rest/v1/rpc/nz_landing_report',{
      method:'POST',headers:{apikey:CLOUD.key,Authorization:'Bearer '+CLOUD.key,'Content-Type':'application/json'},
      body:JSON.stringify({p_token:token,p_days:30}),cache:'no-store',signal:AbortSignal.timeout(10000)
    });
    if (!response.ok) throw Error();
    const {funnel:f, baseline, actions, arrivals_by_button, active_time, sources} = await response.json();
    if (!host.isConnected) return;
    const action = (event,target,key='visitors') => actions.find(a=>a.event===event&&a.target===target)?.[key]||0;
    const visitorRow = (label,event,target) => [label,count(action(event,target)),percent(action(event,target),f.visitors)];
    const actionsRows = Object.entries(controls).map(([id,label]) => [label,count(action('click',id)),count(action('click',id,'total'))]);
    host.innerHTML = '<hr><h3>Лендинг и покупка · 30 дней</h3><p>Уникальные посетители с момента подключения счётчика лендинга. Доли от предыдущего шага сравнивают числа этапов. Показ кнопки и нажатие фиксируются отдельно.</p>'+
      funnel(f,true)+
      '<h4>Кнопки перехода к тренировке</h4>'+
      table(['Расположение','Увидели','Нажали','Клик / показ','Открыли тренажёр'],Object.entries(buttons).map(([id,label])=>{
        const views=action('impression','land_cta_'+id), clicks=action('click','land_cta_'+id);
        return [label,count(views),count(clicks),percent(clicks,views), count(arrivals_by_button.find(x=>x.target==='land_from_'+id)?.visitors)];
      }))+
      '<h4>Прокрутка и блоки</h4>'+
      table(['Этап','Посетители','От всех'],[
        ...[25,50,75,90,100].map(n=>visitorRow(n+'% страницы','scroll','land_scroll_'+n)),
        visitorRow('Увидели подвал','scroll','land_end'),
        ...Object.entries(sections).map(([id,label])=>visitorRow(label,'impression','land_section_'+id))
      ])+
      '<p>Активное время на лендинге в видимой вкладке · медиана <b>'+secs(active_time.median_ms)+'</b> · среднее <b>'+secs(active_time.avg_ms)+'</b> · сессий с замером '+count(active_time.sessions)+'.</p>'+
      '<h4>Попробовали интерактив</h4>'+table(['Действие','Посетители','От всех'],Object.entries(interactions).map(([id,label])=>visitorRow(label,'exercise',id)))+
      '<details><summary>Остальные кнопки и ссылки</summary>'+table(['Действие','Посетители','Всего нажатий'],actionsRows)+'</details>'+
      '<details><summary>Источники перехода</summary>'+table(['Источник','Посетили','Открыли тренажёр','Начали пробную','Оплатили'],sources.map(s=>[s.source,...[s.visitors,s.arrivals,s.trials,s.buyers].map(count)]))+'</details>'+
      baseline.map(b=>'<details><summary>'+esc(b.label)+' · '+esc(date(b.measured_at))+' МСК</summary>'+funnel(b.funnel,false)+'</details>').join('')+
      '<p class="reading-note">Для сравнения берите одинаковые источники трафика и дайте посетителям одинаковое время на прохождение тренировки и покупку.</p>';
  } catch {
    if (host.isConnected) host.innerHTML = '<h3>Лендинг и покупка</h3><p>Не удалось загрузить отчёт. Откройте статистику повторно.</p>';
  }
}
