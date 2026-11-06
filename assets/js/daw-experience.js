/* Silent interface tours: load only in view; preserve static previews for reduced motion/data. */
(()=>{'use strict';
const rate=document.querySelector('[data-daw-rate]'),buffer=document.querySelector('[data-daw-buffer]'),budget=document.querySelector('[data-daw-budget]');
function calculate(){if(rate&&buffer&&budget)budget.textContent=(1000*Number(buffer.value)/Number(rate.value)).toFixed(2)+' ms per callback'}
if(rate)rate.addEventListener('change',calculate);if(buffer)buffer.addEventListener('change',calculate);calculate();
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),connection=navigator.connection;
if(!('IntersectionObserver' in window))return;
const base=new URL('../img/motion/',document.querySelector('script[src*="daw-experience.js"]').src);
const originals=new Map();let observer;
function restore(el){if(originals.has(el)){el.innerHTML=originals.get(el);el.removeAttribute('data-motion-active')}}
function allowed(){return !reduced.matches&&!(connection&&(connection.saveData||/2g/.test(connection.effectiveType)))}
function start(){observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
 const el=entry.target;if(!entry.isIntersecting||!allowed()||el.closest('[hidden]')){restore(el);return}
 if(el.dataset.motionActive)return;
 originals.set(el,el.innerHTML);const old=el.querySelector('img');if(!old)return;
 const picture=document.createElement('picture'),source=document.createElement('source'),img=document.createElement('img');
 source.type='image/webp';source.srcset=new URL(el.dataset.motionStem+'-800.webp',base).href+' 800w, '+new URL(el.dataset.motionStem+'.webp',base).href+' 1600w';source.sizes='(max-width:760px) 94vw, 1440px';
 img.src=new URL(el.dataset.motionStem+'.gif',base).href;img.alt=old.alt;img.width=old.width;img.height=old.height;img.decoding='async';
 img.addEventListener('error',()=>restore(el),{once:true});picture.append(source,img);el.replaceChildren(picture);el.dataset.motionActive='true';
}),{threshold:.15});document.querySelectorAll('[data-motion-stem]').forEach(el=>observer.observe(el));}
reduced.addEventListener('change',()=>{if(!allowed())originals.forEach((_,el)=>restore(el))});
document.addEventListener('visibilitychange',()=>{if(document.hidden)originals.forEach((_,el)=>restore(el))});
let started=false;function begin(){if(started)return;started=true;start()}
['scroll','pointerdown','touchstart','keydown'].forEach(event=>window.addEventListener(event,begin,{once:true,passive:true}));
})();
