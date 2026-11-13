import { CLOUD } from './config.js?v=1.1.2';
import { esc } from './util.js?v=1.1.2';
import { gi, glyph } from './icons.js?v=1.1.2';
import { lineChart } from './charts.js?v=1.1.2';
import { trackAction, trackExercise } from './analytics.js?v=1.4.0';

export const QUESTIONS = {
 sch_f:{title:'Где вам хочется лучше удерживать внимание?',skill:'Внимание',exercise:'Шульте',icon:'eye',options:['Во время работы или учёбы','Когда читаю','В разговорах','Когда много повседневных дел','Просто проверяю себя'],tips:['Перед началом работы выберите одну конкретную задачу и на десять минут уберите уведомления.','После небольшого фрагмента закройте текст и сформулируйте три главные мысли. Затем проверьте себя.','В конце важного разговора коротко повторите договорённость своими словами.','Запишите все дела и выберите одно, к которому приступите сейчас. Остальные пока оставьте в списке.','Повторяйте упражнение в похожих условиях и сравнивайте свои результаты.']},
 sch_r:{title:'Что вам хотелось бы делать легче?',skill:'Переключение',exercise:'Шульте вверх ногами',icon:'grid',options:['Включаться в задачу после перерыва','Переключаться между задачами','Разбираться в новых правилах','Меньше ошибаться в спешке','Пока просто пробую'],tips:['Перед перерывом оставьте себе одну строку: с какого конкретного действия продолжить.','Прежде чем переключиться, запишите, на чём остановились и какой следующий шаг.','Перескажите новое правило своими словами и проверьте его на одном простом примере.','Перед завершением задачи выделите короткую паузу для проверки самого важного.','В следующей попытке сначала удерживайте правильный порядок, затем увеличивайте темп.']},
 dob:{title:'Где вам особенно пригодится внимание к деталям?',skill:'Поиск и точность',exercise:'Совпадения',icon:'eye',options:['Быстрее искать нужное','Замечать ошибки до переделки','Различать похожие варианты','Действовать точнее в спешке','Для меня это интересная игра'],tips:['До поиска сформулируйте один отличительный признак нужного элемента.','Проверяйте работу отдельным проходом: сначала числа, затем имена и даты.','Выберите два признака, по которым отличаются варианты, и сравните их по очереди.','Сначала определите, что именно нужно найти, а уже затем ускоряйте поиск.','Попробуйте улучшить личный результат, сохраняя точность ответов.']},
 mem:{title:'Что вы хотите лучше запоминать?',skill:'Память',exercise:'Запоминание слов',icon:'brain',options:['Прочитанное и изученное','Имена людей','Договорённости и повседневные дела','Новую информацию','Просто развиваю память'],tips:['После изучения материала попробуйте вспомнить главное без подсказок, затем сверьтесь с источником.','При знакомстве повторите имя в разговоре и свяжите его с запоминающейся деталью встречи.','Сразу фиксируйте договорённость вместе с датой и следующим действием.','Разделите новую информацию на небольшие смысловые группы и попробуйте пересказать их.','В упражнении объединяйте слова в связную историю и проверяйте, что удалось вспомнить.']},
};
const FREQUENCY=['Редко','Иногда','Часто','Почти каждый день'];
const memory=new Map(),loaded=new Set(),loading=new Map(),flushing=new Map();
function key(store){return store.session?.key;}
function state(store){const k=key(store);if(!memory.has(k)){let value;try{value=JSON.parse(localStorage.getItem('nz.personal.'+k));}catch{}memory.set(k,value||{answers:{},goal:null,pending:[]});}return memory.get(k);}
function persist(store){try{localStorage.setItem('nz.personal.'+key(store),JSON.stringify(state(store)));}catch{/* Keep the in-memory copy when storage is unavailable. */}}
async function request(store,action,data={}){
 if(!store.session?.token)throw Error('unauthorized');
 const response=await fetch(CLOUD.url+'/rest/v1/rpc/nz_personalization',{method:'POST',headers:{apikey:CLOUD.key,Authorization:'Bearer '+CLOUD.key,'Content-Type':'application/json'},body:JSON.stringify({p_token:store.session.token,p_action:action,p_data:data}),signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(!response.ok)throw Error('personalization_unavailable');return response.json();
}
export function initPersonalization(store){void load(store);}
export async function flushPersonalization(store){
 const k=key(store);if(!k)return;if(flushing.has(k))return flushing.get(k);
 const task=(async()=>{const s=state(store);while(s.pending.length&&key(store)===k){const item=s.pending[0];const result=await request(store,item.action,item.data);if(key(store)!==k)return;if(s.pending[0]===item)s.pending.shift();if(item.action==='routine'&&!s.pending.some(p=>p.action==='routine'))s.exercises=result.exercises;
if(item.action==='goal'&&!s.pending.some(p=>p.action==='goal'))s.goal=result.goal;persist(store);}})().catch(()=>{}).finally(()=>flushing.delete(k));
 flushing.set(k,task);return task;
}
async function load(store){
 const k=key(store);if(!k)return;if(loaded.has(k))return;if(loading.has(k))return loading.get(k);
 const task=(async()=>{try{const remote=await request(store,'get');if(key(store)!==k)return;const s=state(store);const oldRoutine=JSON.stringify(s.exercises);if(!s.pending.some(p=>p.action==='routine'))s.exercises=remote.exercises;
s.answers={...remote.answers,...Object.fromEntries(s.pending.filter(p=>p.action==='answer').map(p=>[p.data.ex,{option:p.data.option,frequency:p.data.frequency}]))};if(!s.pending.some(p=>p.action==='goal'))s.goal=remote.goal;persist(store);loaded.add(k);if(oldRoutine!==JSON.stringify(s.exercises))window.dispatchEvent(new Event('nz-routine-updated'));}catch{}await flushPersonalization(store);})().finally(()=>loading.delete(k));loading.set(k,task);return task;
}
function queue(store,action,data){const s=state(store);s.pending.push({action,data});persist(store);void flushPersonalization(store);}
export function firstResult(store,ex){return store.results.filter(row=>row.ex===ex).slice().sort((a,b)=>a.ts-b.ts||a.id.localeCompare(b.id))[0];}
export async function askQuestion({store,mount,ex,force=false}){
 await Promise.race([load(store),new Promise(resolve=>setTimeout(resolve,600))]);if(!force&&Object.hasOwn(state(store).answers,ex))return;
 const q=QUESTIONS[ex],root=document.createElement('section');root.className='personal-survey';let option=null,frequency=null;
 const start=performance.now();trackAction('survey_view_'+ex);
 await new Promise(resolve=>{
 root.innerHTML='<div class="survey-heading">'+gi(q.icon,'violet','lg')+'<h1>'+q.title+'</h1><p>Подберём полезную подсказку под вашу цель. Ответ необязателен.</p></div>'
  +'<fieldset class="survey-choices"><legend class="sr-only">Выберите один ответ</legend>'+q.options.map((text,i)=>'<label class="survey-option"><input type="radio" name="survey-option" value="'+i+'"><span>'+esc(text)+'</span><i aria-hidden="true">'+glyph.check+'</i></label>').join('')+'</fieldset>'
  +'<fieldset class="survey-frequency" hidden><legend>Как часто это мешает?</legend><div>'+FREQUENCY.map((label,i)=>'<label><input type="radio" name="survey-frequency" value="'+i+'"><span>'+label+'</span></label>').join('')+'</div><small>Можно оставить без ответа.</small></fieldset>'
  +'<button class="btn btn--primary btn--lg btn--block" data-survey-next disabled>Продолжить</button><button class="link" data-survey-skip>Пропустить вопрос</button>';
 mount(root,'survey_'+ex);
 root.addEventListener('change',event=>{if(event.target.name==='survey-option'){option=Number(event.target.value);root.querySelector('[data-survey-next]').disabled=false;root.querySelector('.survey-frequency').hidden=option===4;if(option===4){frequency=null;root.querySelectorAll('[name=survey-frequency]').forEach(input=>input.checked=false);}}if(event.target.name==='survey-frequency')frequency=Number(event.target.value);});
 function finish(skipped){const answer={option:skipped?-1:option,frequency:skipped||option===4?null:frequency};state(store).answers[ex]=answer;queue(store,'answer',{ex,...answer});trackAction((skipped?'survey_skip_':'survey_answer_')+ex);trackExercise('survey',ex,performance.now()-start);resolve();}
 root.querySelector('[data-survey-next]').onclick=()=>finish(false);root.querySelector('[data-survey-skip]').onclick=()=>finish(true);
 });
}
function goalGraph(host,store,goal){
 const rows=store.results.filter(r=>r.ex===goal.ex&&r.ts>=(firstResult(store,goal.ex)?.ts||0));const days=new Map();for(const r of rows)days.set(r.day,Math.max(days.get(r.day)||0,r.score));
 const points=[...days].sort(([a],[b])=>a.localeCompare(b)).slice(-30).map(([day,y])=>({day,y}));
 lineChart(host,points,{color:'#8439b3',color2:'#bd58d4',unit:'баллов',lines:[{y:goal.baseline,label:'Старт: '+goal.baseline,color:'#736481',below:true},{y:goal.target,label:'Цель: '+goal.target+(goal.percent?' (+'+goal.percent+'%)':''),color:'#8439b3'}]});
}
export function drawGoal(host,store){
 const goal=state(store).goal;if(!goal){host.innerHTML='';return;}
 const q=QUESTIONS[goal.ex];const rows=store.results.filter(r=>r.ex===goal.ex).sort((a,b)=>b.ts-a.ts);const current=rows[0]?.score??goal.baseline;
 host.innerHTML='<h3>Ваша цель · '+q.exercise+'</h3><p class="personal-goal-values">Старт <b>'+goal.baseline+'</b><span aria-hidden="true"> → </span>Цель <b>'+goal.target+'</b>'+(goal.percent?' <span>(+'+goal.percent+'%)</span>':'')+'</p><p>Последняя попытка: <b>'+current+'</b> баллов'+(current>=goal.target?' · Цель достигнута!':'')+'</p><div class="personal-goal-chart"></div><small>Это личный ориентир в упражнении. Сравнивайте попытки в похожих условиях; срок достижения не задан.</small>';
 goalGraph(host.querySelector('.personal-goal-chart'),store,goal);
}
export async function paintPersonal({host,store,summary=false,recs=store.results,onEditAnswers=null}){
 if(!host)return;if(!loaded.has(key(store)))await Promise.race([load(store),new Promise(resolve=>setTimeout(resolve,600))]);if(!host.isConnected)return;
 const s=state(store),available=Object.keys(QUESTIONS).filter(ex=>recs.some(r=>r.ex===ex));if(!available.length){host.innerHTML='';return;}
 const answered=available.filter(ex=>s.answers[ex]?.option>=0&&s.answers[ex]?.option<4);
 let chosen=s.goal?.ex&&available.includes(s.goal.ex)?s.goal.ex:answered[0]||available[0];let editing=summary&&!s.goal;
 function render(){
  const q=QUESTIONS[chosen],answer=s.answers[chosen];
  host.innerHTML='<section class="personal-summary glass"><h2>'+(summary?'Ваш следующий шаг':'Личный маршрут')+'</h2><div class="personal-route"></div><div data-personal-goal></div><div data-personal-edit></div></section>';
  const route=host.querySelector('.personal-route');
  if(summary||editing){route.innerHTML='<p>Что для вас сейчас важнее всего?</p><div class="personal-priorities">'+available.map(ex=>'<button class="btn btn--glass" aria-pressed="'+(ex===chosen)+'" data-priority="'+ex+'">'+QUESTIONS[ex].skill+'</button>').join('')+'</div>'
    +'<h3>'+esc(answer?.option>=0?q.options[answer.option]:'Развивать '+q.skill.toLowerCase())+'</h3><p>'+esc(q.tips[answer?.option>=0?answer.option:4])+'</p><p class="personal-next">В приложении: <b>'+q.exercise+'</b>. Отслеживайте результат этого упражнения в следующих тренировках.</p>';}
  const goalHost=host.querySelector('[data-personal-goal]');if(s.goal?.ex===chosen)drawGoal(goalHost,store);
  const edit=host.querySelector('[data-personal-edit]');
  if(!editing){edit.innerHTML='<button class="link" data-edit-goal>'+(s.goal?'Изменить цель':'Выбрать личную цель')+'</button>';edit.querySelector('button').onclick=()=>{editing=true;render();};}
  else{
   const baseline=firstResult(store,chosen);const zero=baseline.score===0;
   edit.innerHTML='<h3>Выберите ориентир для '+q.exercise+'</h3><p>Ваш старт — <b>'+baseline.score+' баллов</b>. Он сохранится после обновления страницы.</p>'
    +(zero?'<label class="personal-custom">Цель в баллах<input type="number" min="1" max="1000" value="10" data-goal-absolute></label>':'<div class="personal-targets" role="group" aria-label="Рост относительно старта">'+[10,20,30].map(n=>'<button class="btn btn--glass" aria-pressed="'+(n===20)+'" data-goal-percent="'+n+'">+'+n+'%</button>').join('')+'</div><label class="personal-custom">Своя цель, %<input type="number" min="1" max="100" value="20" data-goal-custom></label>')
    +'<p data-target-preview role="status"></p><p class="login__err" data-goal-error role="alert"></p><button class="btn btn--primary btn--block" data-save-goal>Сохранить цель</button><small>Выбирайте комфортный ориентир. Это цель, а не прогноз результата.</small>';
   const input=edit.querySelector('input');const preview=()=>{const n=Number(input.value);const valid=input.value!==''&&Number.isInteger(n)&&n>=1&&n<=(zero?1000:100);edit.querySelector('[data-save-goal]').disabled=!valid;edit.querySelector('[data-target-preview]').textContent=valid?'На графике появится цель: '+(zero?n:Math.ceil(baseline.score*(1+n/100)))+' баллов.':'Введите целое число от 1 до '+(zero?1000:100)+'.';edit.querySelectorAll('[data-goal-percent]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.goalPercent)===n)));};
   input.oninput=preview;edit.querySelectorAll('[data-goal-percent]').forEach(button=>button.onclick=()=>{input.value=button.dataset.goalPercent;preview();});preview();
   edit.querySelector('[data-save-goal]').onclick=()=>{const n=Number(input.value);if(edit.querySelector('[data-save-goal]').disabled)return;s.goal={ex:chosen,baseline:baseline.score,baseline_id:baseline.id,baseline_day:baseline.day,percent:zero?null:n,target:zero?n:Math.ceil(baseline.score*(1+n/100))};queue(store,'goal',{ex:chosen,...(zero?{target:n}:{percent:n})});trackAction('personal_goal_saved');editing=false;render();};
  }
  host.querySelectorAll('[data-priority]').forEach(button=>button.onclick=()=>{chosen=button.dataset.priority;editing=true;trackAction('priority_'+chosen);render();});
  if(onEditAnswers){const button=document.createElement('button');button.className='link';button.textContent='Изменить ответы';button.onclick=onEditAnswers;host.querySelector('section').append(button);}
  if(s.pending.length){const note=document.createElement('p');note.className='reading-note';note.dataset.personalSync='';note.textContent='Сохранено на устройстве. Синхронизируем при подключении.';host.querySelector('section').append(note);flushPersonalization(store).then(()=>{if(host.isConnected&&!s.pending.length)host.querySelector('[data-personal-sync]')?.remove();});}
 }
 render();
}

export function selectedExercises(store){const all=Object.keys(QUESTIONS);const chosen=state(store).exercises;return Array.isArray(chosen)&&chosen.length?all.filter(ex=>chosen.includes(ex)):all;}
export function saveExercises(store,exercises){state(store).exercises=exercises;queue(store,'routine',{exercises});}
