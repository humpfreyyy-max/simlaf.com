/* User-started sound, native demonstrations, and a callback-budget illustration. */
(()=>{'use strict';
const media=[...document.querySelectorAll('.daw-world video,.daw-world audio')];
media.forEach(el=>el.addEventListener('play',()=>{
  media.forEach(other=>{if(other!==el)other.pause()});
  document.dispatchEvent(new CustomEvent('simlaf-audio-start',{detail:{ab:false}}));
}));
document.addEventListener('simlaf-audio-start',event=>{
  if(event.detail&&event.detail.ab)media.forEach(el=>el.pause());
});
const film=document.querySelector('[data-daw-film]');
document.querySelectorAll('[data-film-time]').forEach(button=>button.addEventListener('click',()=>{
  if(!film)return;const seek=()=>{film.currentTime=Number(button.dataset.filmTime)};
  if(film.readyState)seek();else film.addEventListener('loadedmetadata',seek,{once:true});
  film.play().catch(()=>{});film.focus();
}));
const rate=document.querySelector('[data-daw-rate]'),buffer=document.querySelector('[data-daw-buffer]'),budget=document.querySelector('[data-daw-budget]');
function calculate(){if(rate&&buffer&&budget)budget.textContent=(1000*Number(buffer.value)/Number(rate.value)).toFixed(2)+' ms per callback'}
if(rate)rate.addEventListener('change',calculate);if(buffer)buffer.addEventListener('change',calculate);calculate();
})();
