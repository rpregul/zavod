import { esc } from './util.js?v=1.1.2';
import { QUESTIONS, selectedExercises, saveExercises } from './personalization.js?v=1.4.0';
const ORDER=['sch_f','sch_r','dob','mem'];
export function openRoutine({store,mount,onHome}){
 const root=document.createElement('section');root.className='routine-page';const selected=new Set(selectedExercises(store));
 root.innerHTML='<button class="link" data-routine-back>На главную</button><h1>Ваша Нейрозарядка</h1><p>Отметьте упражнения, которые будут входить в вашу дневную тренировку. Выбирайте навыки, соответствующие вашим целям, и то, что хочется улучшить.</p><p><b>Главное — регулярность.</b> Если нагрузка велика, сократите число упражнений и занимайтесь понемногу каждый день. Можно начать с одного.</p><div class="routine-options">'+ORDER.map(ex=>'<label class="survey-option"><input type="checkbox" value="'+ex+'" '+(selected.has(ex)?'checked':'')+'><span>'+esc(QUESTIONS[ex].exercise)+'<small>'+esc(QUESTIONS[ex].skill)+'</small></span></label>').join('')+'</div><p data-routine-status role="status"></p><button class="btn btn--primary btn--block" data-routine-save>Сохранить упражнения</button><small>Выбор применяется к дневной зарядке по подписке. Бесплатная пробная включает все четыре игры. История всех упражнений сохраняется.</small>';
 mount(root,'routine');
 const update=()=>{const count=root.querySelectorAll('input:checked').length;root.querySelector('[data-routine-save]').disabled=!count;root.querySelector('[data-routine-status]').textContent=count?'Выбрано: '+count+' из 4':'Выберите хотя бы одно упражнение.';};root.onchange=update;update();
 root.querySelector('[data-routine-back]').onclick=onHome;root.querySelector('[data-routine-save]').onclick=()=>{saveExercises(store,[...root.querySelectorAll('input:checked')].map(x=>x.value));onHome();};
}
export function ownComparisonMarkup(recs,results){
 const ids=[...new Set(recs.map(r=>r.ex))];if(!ids.length)return '';
 const first=ids.map(ex=>results.filter(r=>r.ex===ex).slice().sort((a,b)=>a.ts-b.ts||a.id.localeCompare(b.id))[0]);
 if(first.some(x=>!x))return '';
 const baseline=first.reduce((sum,r)=>sum+r.score,0),current=ids.reduce((sum,ex)=>sum+Math.max(...recs.filter(r=>r.ex===ex).map(r=>r.score)),0);
 const pct=baseline>0?(current/baseline-1)*100:null;const value=pct===null?'':(pct>0?'+':pct<0?'−':'')+Math.abs(pct).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
 return '<section class="summary-comparison glass"><h3>Сравнение с вашим стартом</h3><p>'+(pct===null?'Старт был нулевым: изменение — '+(current-baseline)+' баллов.':value+' к первоначальному результату')+'</p><p>Старт: <b>'+baseline+'</b> · Сейчас: <b>'+current+'</b> баллов</p><small>Сравниваются первые сохранённые попытки и эта тренировка по одинаковым '+ids.length+' упражнениям. Это динамика результатов игр.</small></section>';
}
