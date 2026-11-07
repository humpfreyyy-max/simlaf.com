/* A fixed real deadline, never a visitor-relative or restarting timer. */
(function(){'use strict';var banner=document.querySelector('[data-store-launch]');if(!banner)return;
var target=Date.parse(banner.dataset.opensAt),ready=banner.dataset.salesReady==='true',timer,lastMode;
function state(now){var left=target-(now===undefined?Date.now():now);return !Number.isFinite(target)?'pending':left>0?'scheduled':ready?'open':'pending';}
function allowed(now){return state(now)==='open';}
function render(){var mode=state(),seconds=Math.max(0,Math.ceil((target-Date.now())/1000));if(!Number.isFinite(seconds))seconds=0;var values={days:Math.floor(seconds/86400),hours:Math.floor(seconds/3600)%24,minutes:Math.floor(seconds/60)%60,seconds:seconds%60};Object.keys(values).forEach(function(k){banner.querySelector('[data-count-'+k+']').textContent=String(values[k]).padStart(2,'0');});var headline=banner.querySelector('[data-store-headline]'),note=banner.querySelector('[data-store-message]');banner.dataset.phase=mode;
if(mode==='open'){headline.textContent='The SIMLAF store is open';note.textContent='Explore the collection and choose your sound.';banner.querySelector('[data-store-clock]').hidden=true;}else if(mode==='pending'){headline.textContent='Store opening update';note.textContent='Checkout is not open yet. We will post the opening update here.';}if(mode!==lastMode){lastMode=mode;document.dispatchEvent(new CustomEvent('simlaf:store-change',{detail:{state:mode}}));}if(mode!=='scheduled'&&timer){clearInterval(timer);timer=null;}}
window.SimlafStore={state:state,canCheckout:allowed,opensAt:target};render();if(state()==='scheduled')timer=setInterval(render,1000);
document.addEventListener('visibilitychange',function(){if(document.hidden){clearInterval(timer);timer=null;}else{render();if(state()==='scheduled'&&!timer)timer=setInterval(render,1000);}});
})();
