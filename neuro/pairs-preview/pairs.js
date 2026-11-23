'use strict';
const names=['Лиса','Кит','Ёж','Осьминог','Панда','Фотоаппарат','Воздушный змей','Зонт','Чайник','Компас','Скрипка','Ракета','Клубника','Черепаха','Лев','Шарик','Велосипед','Гитара','Будильник','Кекс'];
const $=id=>document.getElementById(id);
let pairs,choices,phase,deadline,clock,selection=null,drag=null;
function shuffle(items){
 const copy=[...items];
 for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}
 return copy;
}
function art(id){return '<i class="art" role="img" aria-label="'+names[id]+'" style="--x:'+id%5*25+'%;--y:'+Math.floor(id/5)*100/3+'%"></i>';}
function focusTitle(){$('title').focus({preventScroll:true});window.scrollTo(0,0);}
function showExample(){
 phase='example';selection=null;
 pairs=[{items:[0,7],hidden:1,answer:null}];choices=shuffle([4,7,8]);
 $('tip').hidden=false;
 $('welcome').hidden=true;$('game').hidden=false;$('bank').hidden=true;
 $('counter').hidden=true;$('title').textContent='Попробуйте одну пару';
 $('hint').textContent='Запомните, что рядом с лисой.';
 $('rows').innerHTML='<div class="row">'+art(0)+''+art(7)+'</div>';
 $('next').textContent='Я запомнил';focusTitle();
}
const mode = window.parent === window ? null : new URLSearchParams(location.search).get('mode');
const full = mode === 'full';
function startRound(){
 $('counter').hidden=false;
 const deck=shuffle(names.map((_,i)=>i));
 pairs=Array.from({length:full ? 5 : 3},(_,i)=>({items:deck.slice(i*2,i*2+2),hidden:Math.floor(Math.random()*2),answer:null}));
 choices=shuffle([...pairs.map(p=>p.items[p.hidden]),...deck.slice(pairs.length*2,pairs.length*2+10-pairs.length)]);
 document.querySelector('.fireworks')?.remove();phase='study';selection=null;$('welcome').hidden=true;$('game').hidden=false;$('bank').hidden=true;
 $('title').textContent='Запомните пары';$('hint').textContent='Свяжите два рисунка в каждой строке.';
 $('rows').innerHTML=pairs.map(p=>'<div class="row">'+art(p.items[0])+''+art(p.items[1])+'</div>').join('');
 $('next').textContent='Я запомнил';$('next').disabled=false;focusTitle();deadline=Date.now()+(full ? 45000 : 20000);
 clearInterval(clock);clock=setInterval(tick,100);tick();
}
function tick(){
 const t=Math.max(0,Math.ceil((deadline-Date.now())/1000));
 $('counter').textContent='0:'+String(t).padStart(2,'0');
 if(!t) recall();
}
function recall(){
 $('tip').hidden=true;
 const example=phase==='example';clearInterval(clock);phase=example?'try':'recall';
 $('counter').hidden=example;
 const previous=pairs;pairs=shuffle(pairs);
 if(pairs.every((p,i)=>p===previous[i]))pairs.push(pairs.shift());
 $('title').textContent='Восстановите пары';$('hint').textContent='Перетащите слово в пропуск или коснитесь слова, а затем ячейки.';
 if(example){$('title').textContent='Что было рядом с лисой?';$('hint').textContent='Перетащите слово или нажмите на слово и пропуск.';}
 $('rows').innerHTML=pairs.map((p,i)=>{
 const slot='<button class="slot" data-slot="'+i+'" aria-label="Пара для картинки '+names[p.items[1-p.hidden]]+'">＋</button>';
 return '<div class="row">'+(p.hidden===0?slot:art(p.items[0]))+''+(p.hidden===1?slot:art(p.items[1]))+'</div>';
 }).join('');
 $('bank').innerHTML=choices.map(id=>'<button class="word" aria-pressed="false" data-word="'+id+'">'+names[id]+'</button>').join('');
 $('bank').hidden=false;$('next').textContent='Проверить';refresh();$('next').hidden=example;focusTitle();
}
function refresh(){
 document.querySelectorAll('[data-slot]').forEach((el,i)=>{
 const p=pairs[i];el.textContent=names[p.answer]||'＋';el.setAttribute('aria-label',names[p.items[1-p.hidden]]+' — '+(names[p.answer]||'пустая ячейка'));
 });
 document.querySelectorAll('[data-word]').forEach(el=>{
  const word=Number(el.dataset.word);
  el.hidden=pairs.some(p=>p.answer===word);
  el.setAttribute('aria-pressed',String(word===selection));
 });
 const count=pairs.filter(p=>p.answer!==null).length;$('counter').textContent=count+' / '+pairs.length;$('next').disabled=count!==pairs.length;
}
function assign(i,word){
 if(phase==='try' && word!==pairs[i].items[pairs[i].hidden]){
  selection=null;refresh();$('hint').textContent='Рядом с лисой был зонт. Попробуйте ещё раз.';return;
 }
 pairs[i].answer=word;selection=null;refresh();$('status').textContent=names[word]+' — в паре с картинкой '+names[pairs[i].items[1-pairs[i].hidden]]+'.';
 if(phase==='try'){
  phase='ready';$('title').textContent='Верно!';$('hint').textContent='';
  $('bank').hidden=true;$('next').hidden=false;$('next').textContent='Начать упражнение';$('next').focus();
 }
}
function celebrate(){
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const overlay=document.createElement('div');
 overlay.className='fireworks';
 overlay.setAttribute('aria-hidden','true');
 document.body.append(overlay);
 const colors=['#ff755f','#f54a99','#ffba31','#9267e3','#36b5ac'];
 for(let burst=0;burst<3;burst++){
  for(let i=0;i<18;i++){
   const spark=document.createElement('i');
   const angle=i*2*Math.PI/18;
   const radius=48+Math.random()*52;
   spark.style.left=[22,77,50][burst]+'%';
   spark.style.top=[32,36,23][burst]+'%';
   spark.style.background=colors[i%colors.length];
   overlay.append(spark);
   spark.animate([{opacity:0,transform:'scale(.3)'},{opacity:1,offset:.12},{opacity:0,transform:'translate('+Math.cos(angle)*radius+'px,'+(Math.sin(angle)*radius+16)+'px) scale(.35)'}],{duration:850,delay:burst*240,easing:'ease-out'});
  }
 }
 setTimeout(()=>overlay.remove(),1500);
}
function finish(){
 phase='done';$('bank').hidden=true;const score=pairs.filter(p=>p.answer===p.items[p.hidden]).length;
 $('title').textContent=score===pairs.length?'Отличная память!':score===0?'Попробуйте ещё раз':score===pairs.length-1?'Почти получилось!':'Хорошее начало!';$('counter').textContent=score+' / '+pairs.length;$('hint').textContent='Правильных ответов — '+score+' из '+pairs.length+'.';
 $('rows').innerHTML=pairs.map(p=>{
 const answer=p.items[p.hidden],right=p.answer===answer;
 return '<div class="row">'+art(p.items[1-p.hidden])+'<span class="'+(right?'correct':'wrong')+'">'+(right?'✓ ':'✕ ')+names[p.answer]+(right?'':'<small>Верно: '+names[answer]+'</small>')+'</span></div>';
 }).join('');
 if(mode==='trial'||full){
  window.frameElement.dispatchEvent(new CustomEvent('pairs-result',{detail:{score,total:pairs.length,answers:pairs.map(p=>({picture:p.items[1-p.hidden],given:names[p.answer],correct:names[p.items[p.hidden]]}))}}));
  return;
 }
 $('next').textContent='Сыграть ещё раз';focusTitle();if(score===pairs.length)celebrate();
}
$('start').onclick=async()=>{
 $('start').disabled=true;const img=new Image();img.src='art-c47f7c.webp';
 try{await img.decode();if(mode==='trial'||full)startRound();else showExample();}catch{$('error').textContent='Картинки не загрузились. Попробуйте ещё раз.';}finally{$('start').disabled=false;}
};
$('next').onclick=()=>{if(phase==='study'||phase==='example')recall();else if(phase==='recall')finish();else if(mode==='practice')window.frameElement.dispatchEvent(new Event('pairs-ready'));else startRound();};
$('rows').onclick=e=>{const slot=e.target.closest('[data-slot]');if(!slot||!['recall','try'].includes(phase))return;
 const i=Number(slot.dataset.slot);
 if(selection!==null)assign(i,selection);
 else if(pairs[i].answer!==null){pairs[i].answer=null;refresh();$('status').textContent='Слово возвращено в список.';}};
const bank=$('bank');let suppressClick=false;
bank.onclick=e=>{const word=e.target.closest('[data-word]');if(!word||suppressClick)return;selection=selection===+word.dataset.word?null:+word.dataset.word;refresh();};
function targetSlot(ghost){
 const box=ghost.getBoundingClientRect();let best=null,largest=0;
 for(const slot of document.querySelectorAll('[data-slot]')){
  const r=slot.getBoundingClientRect();
  const area=Math.max(0,Math.min(box.right,r.right)-Math.max(box.left,r.left))*Math.max(0,Math.min(box.bottom,r.bottom)-Math.max(box.top,r.top));
  if(area>largest){largest=area;best=slot;}
 }
 return best;
}
function position(){
 if(!drag?.ghost)return;
 const {x,y,ghost}=drag;ghost.style.left=x+'px';ghost.style.top=y+'px';
 const slot=targetSlot(ghost);if(slot!==drag.slot){drag.slot?.classList.remove('over');slot?.classList.add('over');drag.slot=slot;}
}
function autoScroll(){
 if(!drag?.ghost)return;
 if(drag.y<80)window.scrollBy(0,-8);else if(drag.y>innerHeight-80)window.scrollBy(0,8);
 position();drag.frame=requestAnimationFrame(autoScroll);
}
bank.onpointerdown=e=>{
 const word=e.target.closest('[data-word]');if(!word||e.button!==0||drag)return;
 suppressClick=false;drag={id:e.pointerId,word,fromX:e.clientX,fromY:e.clientY,x:e.clientX,y:e.clientY};word.setPointerCapture(e.pointerId);
};
bank.onpointermove=e=>{
 if(drag?.id!==e.pointerId)return;
 drag.x=e.clientX;drag.y=e.clientY;
 if(!drag.ghost && Math.hypot(drag.x-drag.fromX,drag.y-drag.fromY)>7){
 const ghost=document.createElement('span');ghost.className='word ghost';ghost.textContent=drag.word.textContent;ghost.setAttribute('aria-hidden','true');document.body.append(ghost);drag.ghost=ghost;autoScroll();
 }
 position();
};
function endDrag(e){
 if(drag?.id!==e.pointerId)return;
 if(drag.ghost && e.type==='pointerup'){drag.x=e.clientX;drag.y=e.clientY;position();}
 const {word,ghost,frame,slot}=drag;drag=null;cancelAnimationFrame(frame);slot?.classList.remove('over');
 if(ghost){ghost.remove();suppressClick=true;setTimeout(()=>suppressClick=false,0);
 const dest=slot;if(dest&&e.type==='pointerup')assign(+dest.dataset.slot,+word.dataset.word);}
}
bank.onpointerup=endDrag;bank.onpointercancel=endDrag;bank.onlostpointercapture=endDrag;


if(['trial','full','practice'].includes(mode)){
 document.body.classList.add('embedded');
 document.querySelector('header').hidden=true;
 $('start').click();
}
