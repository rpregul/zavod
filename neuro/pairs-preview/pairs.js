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
 pairs=[{items:[0,7],hidden:1,answer:null}];choices=[4,7];
 $('welcome').hidden=true;$('game').hidden=false;$('bank').hidden=true;
 $('counter').textContent='Без таймера';$('title').textContent='Попробуйте одну пару';
 $('hint').textContent='Запомните, что рядом с лисой.';
 $('rows').innerHTML='<div class="row">'+art(0)+'<span class="link"></span>'+art(7)+'</div>';
 $('next').textContent='Я запомнил';focusTitle();
}
function startRound(){
 const deck=shuffle(names.map((_,i)=>i));
 pairs=Array.from({length:3},(_,i)=>({items:deck.slice(i*2,i*2+2),hidden:Math.floor(Math.random()*2),answer:null}));
 choices=shuffle([...pairs.map(p=>p.items[p.hidden]),...deck.slice(6,13)]);
 document.querySelector('.fireworks')?.remove();phase='study';selection=null;$('welcome').hidden=true;$('game').hidden=false;$('bank').hidden=true;
 $('title').textContent='Запомните пары';$('hint').textContent='Свяжите два рисунка в каждой строке.';
 $('rows').innerHTML=pairs.map(p=>'<div class="row">'+art(p.items[0])+'<span class="link"></span>'+art(p.items[1])+'</div>').join('');
 $('next').textContent='Я запомнил';$('next').disabled=false;focusTitle();deadline=Date.now()+20000;
 clearInterval(clock);clock=setInterval(tick,100);tick();
}
function tick(){
 const t=Math.max(0,Math.ceil((deadline-Date.now())/1000));
 $('counter').textContent='0:'+String(t).padStart(2,'0');
 if(!t) recall();
}
function recall(){
 const example=phase==='example';clearInterval(clock);phase=example?'try':'recall';
 const previous=pairs;pairs=shuffle(pairs);
 if(pairs.every((p,i)=>p===previous[i]))pairs.push(pairs.shift());
 $('title').textContent='Восстановите пары';$('hint').textContent='Перетащите слово в пропуск или коснитесь слова, а затем ячейки.';
 if(example){$('title').textContent='Что было рядом с лисой?';$('hint').textContent='Перетащите слово или нажмите на слово и пропуск.';}
 $('rows').innerHTML=pairs.map((p,i)=>{
 const slot='<button class="slot" data-slot="'+i+'" aria-label="Пара для картинки '+names[p.items[1-p.hidden]]+'">＋</button>';
 return '<div class="row">'+(p.hidden===0?slot:art(p.items[0]))+'<span class="link"></span>'+(p.hidden===1?slot:art(p.items[1]))+'</div>';
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
  phase='ready';$('title').textContent='Верно!';$('hint').textContent='Теперь попробуйте три пары.';
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
 $('title').textContent=['Попробуйте ещё раз','Хорошее начало!','Почти получилось!','Отличная память!'][score];$('counter').textContent=score+' / '+pairs.length;$('hint').textContent='Правильных ответов — '+score+' из '+pairs.length+'.';
 $('rows').innerHTML=pairs.map(p=>{
 const answer=p.items[p.hidden],right=p.answer===answer;
 return '<div class="row">'+art(p.items[1-p.hidden])+'<span class="link"></span><span class="'+(right?'correct':'wrong')+'">'+(right?'✓ ':'✕ ')+names[p.answer]+(right?'':'<small>Верно: '+names[answer]+'</small>')+'</span></div>';
 }).join('');
 $('next').textContent='Сыграть ещё раз';focusTitle();if(score===pairs.length)celebrate();
}
$('start').onclick=async()=>{
 $('start').disabled=true;const img=new Image();img.src='art-c47f7c.webp';
 try{await img.decode();showExample();}catch{$('error').textContent='Картинки не загрузились. Попробуйте ещё раз.';}finally{$('start').disabled=false;}
};
$('next').onclick=()=>{if(phase==='study'||phase==='example')recall();else if(phase==='recall')finish();else startRound();};
$('rows').onclick=e=>{const slot=e.target.closest('[data-slot]');if(!slot||!['recall','try'].includes(phase))return;
 const i=Number(slot.dataset.slot);
 if(selection!==null)assign(i,selection);
 else if(pairs[i].answer!==null){pairs[i].answer=null;refresh();$('status').textContent='Слово возвращено в список.';}};
const bank=$('bank');let suppressClick=false;
bank.onclick=e=>{const word=e.target.closest('[data-word]');if(!word||suppressClick)return;selection=selection===+word.dataset.word?null:+word.dataset.word;refresh();};
function targetSlot(x,y){return document.elementFromPoint(x,y)?.closest('[data-slot]');}
function position(){
 if(!drag?.ghost)return;
 const {x,y,ghost}=drag;ghost.style.left=x+'px';ghost.style.top=y+'px';
 const slot=targetSlot(x,y);if(slot!==drag.slot){drag.slot?.classList.remove('over');slot?.classList.add('over');drag.slot=slot;}
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
 const {word,ghost,frame,slot}=drag;drag=null;cancelAnimationFrame(frame);slot?.classList.remove('over');
 if(ghost){ghost.remove();suppressClick=true;setTimeout(()=>suppressClick=false,0);
 const dest=targetSlot(e.clientX,e.clientY);if(dest&&e.type==='pointerup')assign(+dest.dataset.slot,+word.dataset.word);}
}
bank.onpointerup=endDrag;bank.onpointercancel=endDrag;bank.onlostpointercapture=endDrag;

