// CONFIG YÜKLENENE KADAR BEKLE
await window.waitConfig();

// Supabase
const SUPABASE_URL = "https://jarsxtpqzqzhlshpmgot.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphcnN4dHBxenF6aGxzaHBtZ290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyODExMTcsImV4cCI6MjA3Nzg1NzExN30.98oYONSkb8XSDrfGW2FxhFmt2BLB5ZRo3Ho50GhZYgE";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Marka değişkenleri
const TABLE         = CONFIG.table;
const WH_KARGOLA    = CONFIG.webhooks.kargola;
const WH_BARKOD     = CONFIG.webhooks.barkod;
const WH_IPTAL      = CONFIG.webhooks.iptal;
const WH_SEHIR_ILCE = CONFIG.webhooks.sehir_ilce;

// Global
let currentTab = "bekleyen";
let currentPage = 1;
let selectedOrder = null;
const busy = { kargola:new Set(), barkod:new Set() };

// UI helpers
function toast(msg, ms=2400){
  const t = document.createElement("div"); t.className="toast"; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(), ms);
}
function confirmModal({title, text, confirmText="Onayla", cancelText="Vazgeç"}){
  return new Promise(res=>{
    const root = document.getElementById("alertRoot");
    const wrap = document.createElement("div");
    wrap.className="alert-backdrop";
    wrap.innerHTML = `
      <div class="alert-card">
        <div class="alert-title">${title}</div>
        <div class="alert-text">${text.replace(/\n/g,"<br>")}</div>
        <div class="alert-actions">
          <button class="btn-ghost" id="aCancel">${cancelText}</button>
          <button class="btn-brand" id="aOk">${confirmText}</button>
        </div>
      </div>`;
    root.appendChild(wrap);
    wrap.querySelector("#aCancel").onclick=()=>{wrap.remove();res(false)};
    wrap.querySelector("#aOk").onclick=()=>{wrap.remove();res(true)};
  });
}
function logout(){ localStorage.clear(); location.href="login.html"; }

// Liste
async function loadOrders(reset=false){
  const tbody = document.getElementById("ordersBody");
  if(reset){ currentPage=1; tbody.innerHTML=""; }

  let q = db.from(TABLE).select("*");
  if(currentTab==="bekleyen")   q=q.eq("kargo_durumu","Bekliyor");
  if(currentTab==="hazirlandi") q=q.eq("kargo_durumu","Hazırlandı");
  if(currentTab==="kargolandi") q=q.eq("kargo_durumu","Kargolandı");
  if(currentTab==="tamamlandi") q=q.eq("kargo_durumu","Tamamlandı");
  if(currentTab==="sorunlu")    q=q.eq("kargo_durumu","Sorunlu");
  if(currentTab==="iptal")      q=q.eq("kargo_durumu","İptal");

  q = q.order("siparis_no",{ascending:false}).range(0, currentPage*20 - 1);
  const { data, error } = await q;
  if(error){ tbody.innerHTML = `<tr><td colspan="7">HATA: ${error.message}</td></tr>`; return; }
  renderTable(data);
}

function renderTable(rows){
  const tbody = document.getElementById("ordersBody");
  tbody.innerHTML = "";

  if(!rows || rows.length===0){
    tbody.innerHTML = `<tr><td colspan="7">Kayıt bulunamadı</td></tr>`;
    return;
  }

  rows.forEach(o=>{
    const tr = document.createElement("tr");

    const durumText = currentTab==="kargolandi" ? (o.shipmentStatus ?? "—") : o.kargo_durumu;
    const actionBtn = currentTab==="kargolandi"
      ? `<button class="btn-open" onclick="event.stopPropagation(); openTracking('${o.kargo_takip_url??""}')">Sorgula</button>`
      : `<button class="btn-open">Aç</button>`;

    tr.innerHTML = `
      <td>${o.siparis_no}</td>
      <td>${o.ad_soyad}</td>
      <td>${parseProduct(o.urun_bilgisi)}</td>
      <td>${o.toplam_tutar} TL</td>
      <td>${durumText}</td>
      <td>${o.kargo_takip_kodu ?? "-"}</td>
      <td>${actionBtn}</td>
    `;

    // satır tıklaması (btn-open hariç)
    tr.addEventListener("click", (e)=>{
      if(e.target.classList.contains("btn-open")) return;
      openOrder(o.siparis_no);
    });

    tbody.appendChild(tr);
  });
}

function parseProduct(v){
  if(!v) return "-";
  try{ if(v.startsWith("[") && v.endsWith("]")) return JSON.parse(v).join(", "); }catch{}
  return v;
}

function openTracking(url){
  if(!url) return toast("Kargo sorgulama linki yok.");
  window.open(url,"_blank");
}

// Detay
async function openOrder(id){
  const { data } = await db.from(TABLE).select("*").eq("siparis_no", id).single();
  if(!data) return toast("Sipariş bulunamadı!");
  selectedOrder = data; renderDetails();
  document.getElementById("orderModal").style.display="flex";
}
function closeModal(){ document.getElementById("orderModal").style.display="none"; }

function renderDetails(){
  const d = selectedOrder;
  document.getElementById("orderDetails").innerHTML = `
    <p><b>No:</b> ${d.siparis_no}</p>
    <p><b>İsim:</b> ${d.ad_soyad}</p>
    <p><b>Sipariş Alan Tel:</b> ${d.siparis_tel}</p>
    <p><b>Müşteri Tel:</b> ${d.musteri_tel}</p>
    <p><b>Adres:</b> ${d.adres}</p>
    <p>
      <b>Şehir / İlçe:</b> ${d.sehir} / ${d.ilce}
      <button class="btn-mini" onclick="queryCityDistrict()">Sor</button>
      <br><small>Kodlar: ${d.sehir_kodu ?? "-"} / ${d.ilce_kodu ?? "-"}</small>
    </p>
    <p><b>Ürün:</b> ${parseProduct(d.urun_bilgisi)}</p>
    <p><b>Adet:</b> ${d.kargo_adet ?? "-"}</p>
    <p><b>KG:</b> ${d.kargo_kg ?? "-"}</p>
    <p><b>Tutar:</b> ${d.toplam_tutar} TL</p>
    <p><b>Ödeme:</b> ${d.odeme_sekli}</p>
    <p><b>Not:</b> ${d.notlar ?? "-"}</p>
  `;

  const iptal = d.kargo_durumu==="İptal";
  const kargo = d.kargo_durumu==="Kargolandı";
  const tamam = d.kargo_durumu==="Tamamlandı";

  document.getElementById("btnPrepare").style.display = d.kargo_durumu==="Bekliyor"   ? "inline-block":"none";
  document.getElementById("btnCargo").style.display   = d.kargo_durumu==="Hazırlandı" ? "inline-block":"none";
  document.getElementById("btnBarcode").style.display = kargo ? "inline-block":"none";
  document.getElementById("btnWaiting").style.display = (!["Bekliyor","Kargolandı"].includes(d.kargo_durumu)) ? "inline-block":"none";

  document.getElementById("actionButtons").style.display = iptal ? "none":"flex";
  document.getElementById("restoreButtons").style.display= iptal ? "flex":"none";

  if(tamam){
    document.querySelector("#actionButtons .btn-warning").style.display="none";
    document.querySelector("#actionButtons .btn-danger").style.display="none";
    document.getElementById("btnPrepare").style.display="none";
    document.getElementById("btnCargo").style.display="none";
    document.getElementById("btnBarcode").style.display="none";
    document.getElementById("btnWaiting").style.display="none";
  }

  document.getElementById("editButtons").style.display="none";
  document.getElementById("cancelForm").style.display="none";
}

// Şehir/İlçe kod sor
async function queryCityDistrict(){
  toast("Kodlar sorgulanıyor...");
  const res = await fetch(WH_SEHIR_ILCE, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(selectedOrder)
  });
  if(!res.ok) return toast("Kod bulunamadı");

  const d = await res.json();
  await db.from(TABLE).update({ sehir_kodu:d.sehir_kodu, ilce_kodu:d.ilce_kodu }).eq("siparis_no", selectedOrder.siparis_no);
  toast("Kodlar güncellendi");
  openOrder(selectedOrder.siparis_no);
}

// Edit
function enterEditMode(){
  const d = selectedOrder;
  document.getElementById("orderDetails").innerHTML = `
    <div class="edit-grid">
      <div><label>Ad Soyad</label><input id="ad_soyad" value="${d.ad_soyad??""}"></div>
      <div><label>Sipariş Tel</label><input id="siparis_tel" value="${d.siparis_tel??""}"></div>
      <div><label>Müşteri Tel</label><input id="musteri_tel" value="${d.musteri_tel??""}"></div>
      <div class="full-row"><label>Adres</label><textarea id="adres">${d.adres??""}</textarea></div>
      <div><label>Şehir</label><input id="sehir" value="${d.sehir??""}"></div>
      <div><label>İlçe</label><input id="ilce" value="${d.ilce??""}"></div>
      <div><label>Kargo Adet</label><input id="kargo_adet" value="${d.kargo_adet??""}"></div>
      <div><label>Kargo KG</label><input id="kargo_kg" value="${d.kargo_kg??""}"></div>
      <div class="full-row"><label>Ürün</label><textarea id="urun_bilgisi">${d.urun_bilgisi??""}</textarea></div>
      <div><label>Tutar</label><input id="toplam_tutar" value="${d.toplam_tutar??""}"></div>
      <div><label>Ödeme</label><input id="odeme_sekli" value="${d.odeme_sekli??""}"></div>
      <div class="full-row"><label>Not</label><textarea id="notlar">${d.notlar??""}</textarea></div>
    </div>`;
  document.getElementById("actionButtons").style.display="none";
  document.getElementById("editButtons").style.display="flex";
}
async function saveEdit(){
  const updated = {
    ad_soyad: ad_soyad.value, siparis_tel: siparis_tel.value, musteri_tel: musteri_tel.value,
    adres: adres.value, sehir: sehir.value, ilce: ilce.value,
    kargo_adet: kargo_adet.value, kargo_kg: kargo_kg.value,
    urun_bilgisi: urun_bilgisi.value, toplam_tutar: toplam_tutar.value,
    odeme_sekli: odeme_sekli.value, notlar: notlar.value
  };
  await db.from(TABLE).update(updated).eq("siparis_no", selectedOrder.siparis_no);
  toast("Kaydedildi"); closeModal(); loadOrders(true);
}
function cancelEdit(){ renderDetails(); document.getElementById("editButtons").style.display="none"; document.getElementById("actionButtons").style.display="flex"; }

// Durum değişimleri
async function markPrepared(){
  await db.from(TABLE).update({kargo_durumu:"Hazırlandı"}).eq("siparis_no", selectedOrder.siparis_no);
  toast("Hazırlandı"); closeModal(); loadOrders(true);
}
async function sendToCargo(){
  const ok = await confirmModal({title:"Kargoya Gönder", text:"Bu sipariş KARGOLANDI yapılacak."});
  if(!ok) return;
  const key = selectedOrder.siparis_no;
  if(busy.kargola.has(key)) return toast("İşlem zaten gönderildi");
  busy.kargola.add(key);
  try{
    await fetch(WH_KARGOLA, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(selectedOrder) });
    toast("Kargoya gönderildi");
  }catch(e){ toast("Gönderim hatası"); }
  finally{ setTimeout(()=>busy.kargola.delete(key), 30000); }
}
async function printBarcode(){
  const ok = await confirmModal({title:"Barkod Kes", text:"Barkod isteği gönderilecek."});
  if(!ok) return;
  const key = selectedOrder.siparis_no;
  if(busy.barkod.has(key)) return toast("Barkod isteği bekliyor");
  busy.barkod.add(key);
  try{
    await fetch(WH_BARKOD, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(selectedOrder) });
    toast("Barkod gönderildi");
  }catch(e){ toast("Barkod hatası"); }
  finally{ setTimeout(()=>busy.barkod.delete(key), 20000); }
}

// İptal / geri al
function openCancelForm(){ document.getElementById("cancelForm").style.display="block"; document.getElementById("actionButtons").style.display="none"; }
function cancelCancelForm(){ document.getElementById("cancelForm").style.display="none"; document.getElementById("actionButtons").style.display="flex"; }
async function confirmCancel(){
  const reason = document.getElementById("iptalInput").value.trim();
  if(!reason) return toast("İptal nedeni gerekli");
  await fetch(WH_IPTAL,{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({...selectedOrder, reason}) });
  await db.from(TABLE).update({ kargo_durumu:"İptal", iptal_nedeni:reason, iptal_tarihi:new Date().toISOString() }).eq("siparis_no", selectedOrder.siparis_no);
  toast("İptal edildi"); closeModal(); loadOrders(true);
}
async function restoreOrder(){
  await db.from(TABLE).update({ kargo_durumu:"Bekliyor", iptal_nedeni:null, iptal_tarihi:null }).eq("siparis_no", selectedOrder.siparis_no);
  toast("Geri alındı"); closeModal(); loadOrders(true);
}

// Arama
async function searchOrders(){
  const q = document.getElementById("searchInput").value.trim();
  if(!q) return loadOrders(true);
  const { data } = await db.from(TABLE).select("*").or(`
    siparis_no.eq.${q},
    ad_soyad.ilike.%${q}%,
    siparis_tel.ilike.%${q}%,
    musteri_tel.ilike.%${q}%,
    adres.ilike.%${q}%,
    kargo_takip_kodu.ilike.%${q}%
  `);
  renderTable(data);
}
function clearSearch(){ document.getElementById("searchInput").value=""; loadOrders(true); }

// Tab
function setTab(tab){
  currentTab = tab;
  document.querySelectorAll(".menu li").forEach(li=>li.classList.remove("active"));
  const el = document.getElementById(`tab_${tab}`);
  if(el) el.classList.add("active");
  loadOrders(true);
}

// Load more
function loadMore(){ currentPage++; loadOrders(false); }

// Mobil menü
function toggleMenu(){ document.querySelector(".sidebar").classList.toggle("open"); }
document.addEventListener("click", e=>{
  const sidebar = document.querySelector(".sidebar");
  const btn = document.querySelector(".mobile-menu-btn");
  if(!sidebar.classList.contains("open")) return;
  if(sidebar.contains(e.target) || btn.contains(e.target)) return;
  sidebar.classList.remove("open");
});

// init
loadOrders(true);
