/* =========================================================
   Sats in a Bottle — client-side "backend simulator"
   In production this logic lives on the server (see /backend):
   - bottles are stored in Postgres/SQLite, not localStorage
   - the timelock is a real Bitcoin CLTV transaction, not a date check
   - M-Pesa + SMS are real Daraja / Africa's Talking calls, not setTimeout
   This file exists so the MVP is fully demoable in a browser with
   zero server setup.
   ========================================================= */

const STORE_KEY = "satsInABottle.bottles.v1";
const BTC_KES_RATE = 11_800_000; // mock rate: 1 BTC = 11.8M KES

const Store = {
  all(){
    try{ return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
    catch(e){ return []; }
  },
  save(bottles){
    localStorage.setItem(STORE_KEY, JSON.stringify(bottles));
  },
  add(bottle){
    const bottles = Store.all();
    bottles.unshift(bottle);
    Store.save(bottles);
    return bottle;
  },
  find(id){
    return Store.all().find(b => b.id === id);
  },
  update(id, patch){
    const bottles = Store.all();
    const idx = bottles.findIndex(b => b.id === id);
    if(idx > -1){ bottles[idx] = {...bottles[idx], ...patch}; Store.save(bottles); }
    return bottles[idx];
  }
};

function uid(prefix="bottle"){
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
}

function kesToSats(kes){
  const btc = kes / BTC_KES_RATE;
  return Math.round(btc * 100_000_000);
}
function satsToKes(sats){
  const btc = sats / 100_000_000;
  return Math.round(btc * BTC_KES_RATE);
}
function formatKes(n){
  return "KES " + Number(n).toLocaleString("en-KE");
}
function formatSats(n){
  return Number(n).toLocaleString("en-KE") + " sats";
}
function formatDate(dateStr){
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" });
}

function isUnlocked(bottle){
  return new Date() >= new Date(bottle.unlockDate);
}

function timeUntil(dateStr){
  const diff = new Date(dateStr).getTime() - Date.now();
  if(diff <= 0) return { days:0, hours:0, minutes:0, seconds:0, done:true };
  const s = Math.floor(diff/1000);
  return {
    days: Math.floor(s/86400),
    hours: Math.floor((s%86400)/3600),
    minutes: Math.floor((s%3600)/60),
    seconds: Math.floor(s%60),
    done:false
  };
}

function getParam(name){
  return new URLSearchParams(window.location.search).get(name);
}

function navSetActive(){
  const path = window.location.pathname.split("/").pop();
  document.querySelectorAll("[data-nav]").forEach(el => {
    if(el.getAttribute("data-nav") === path) el.classList.add("is-active");
  });
}
document.addEventListener("DOMContentLoaded", navSetActive);
