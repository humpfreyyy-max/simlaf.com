/* Native interface captures stay still. Keep the audio callback budget calculator. */
(()=>{'use strict';
const rate=document.querySelector('[data-daw-rate]'),buffer=document.querySelector('[data-daw-buffer]'),budget=document.querySelector('[data-daw-budget]');
function calculate(){if(rate&&buffer&&budget)budget.textContent=(1000*Number(buffer.value)/Number(rate.value)).toFixed(2)+' ms per callback'}
if(rate)rate.addEventListener('change',calculate);if(buffer)buffer.addEventListener('change',calculate);calculate();
})();
