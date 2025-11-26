// ==============================
// Supabase
// ==============================
const SUPABASE_URL = "https://jarsxtpqzqzhlshpmgot.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphcnN4dHBxenF6aGxzaHBtZ290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyODExMTcsImV4cCI6MjA3Nzg1NzExN30.98oYONSkb8XSDrfGW2FxhFmt2BLB5ZRo3Ho50GhZYgE";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==============================
// Global
// ==============================
let currentTab = "bekleyen";
let currentPage = 1;
let selectedOrder = null;

const TABLE = "queen_siparisler";
const WH_KARGOLA = "https://n8n.ozkanceylan.uk/webhook/kargola_queen";
const WH_BARKOD  = "https://n8n.ozkanceylan.uk/webhook/barkod_queen";
const WH_IPTAL   = "https://n8n.ozkanceylan.uk/webhook/kargo_iptal_queen";
const WH_SEHIR_ILCE = "https://n8n.ozkanceylan.uk/webhook/sehir_ilce_kodu_sor";

// double-submit engelleme
const busy = { kargola: new Set(), barkod: new Set() };

// ==============================
// Toast / Confirm
// ==============================
function confirmModal({title, text, confirmText="Onayla", cancelText="Vazgeç"}){
  return new Promise(res=>{
    const root = document.getElementById("alertRoot");
    const wrap = document.createElement("div");
    wrap.className = "alert-backdrop";
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
    wrap.querySelector("#aCancel").onclick=()=>{ root.removeChild(wrap); res(false); };
    wrap.querySelector("#aOk").onclick=()=>{ root.removeChild(wrap); res(true); };
  });
}

function toast(msg, ms=2600){
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>{ t.remove(); }, ms);
}

// ==============================
// Logout
// ==============================
function logout(){ localStorage.clear(); location.href="login.html"; }

// ==============================
// Load Orders
// ==============================
async function loadOrders(reset=false){
  const tbody = document.getElementById("ordersBody");
  if(reset){ currentPage=1; tbody.innerHTML=""; }

  let q = db.from(TABLE).select("*");

  if(currentTab==="bekleyen")   q = q.eq("kargo_durumu","Bekliyor");
  if(currentTab==="hazirlandi") q = q.eq("kargo_durumu","Hazırlandı");
  if(currentTab==="kargolandi") q = q.eq("kargo_durumu","Kargolandı");
  if(currentTab==="tamamlandi") q = q.eq("kargo_durumu","Tamamlandı");
  if(currentTab==="sorunlu")    q = q.eq("kargo_durumu","Sorunlu");
  if(currentTab==="iptal")      q = q.eq("kargo_durumu","İptal");

  q = q.order("siparis_no",{ascending:false})
       .range(0, currentPage*20-1);

  const { data, error } = await q;
  if(error){ tbody.innerHTML=`<tr><td colspan="7">HATA: ${error.message}</td></tr>`; return; }

  renderTable(data);
}

// ==============================
// TABLO RENDER
// ==============================
function renderTable(rows){
  const tbody = document.getElementById("ordersBody");
  tbody.innerHTML = "";

  if(!rows || rows.length===0){
    tbody.innerHTML = `<tr><td colspan="7">Kayıt bulunamadı</td></tr>`;
    return;
  }

  rows.forEach(o=>{
    const tr = document.createElement("tr");

    // kargolandı sekmesinde DURUM = shipmentStatus
    const durumText =
      (currentTab === "kargolandi")
      ? (o.shipmentStatus ?? "—")
      : o.kargo_durumu;

    // kargolandı sekmesinde aç yerine SORGULA
    const actionBtn =
      (currentTab === "kargolandi")
      ? `<button class="btn-open" onclick="event.stopPropagation(); openTrackingUrl('${o.kargo_takip_url ?? ''}')">Sorgula</button>`
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

    // kargolandı değilse normal aç
    if(currentTab !== "kargolandi"){
      tr.addEventListener("click", e=>{
        if(!e.target.classList.contains("btn-open")){
          openOrder(o.siparis_no);
        }
      });
      tr.querySelector(".btn-open").addEventListener("click", e=>{
        e.stopPropagation();
        openOrder(o.siparis_no);
      });
    }

    tbody.appendChild(tr);
  });
}

// ==============================
// Tracking URL Aç
// ==============================
function openTrackingUrl(url){
  if(!url){ toast("Kargo sorgulama linki yok."); return; }
  window.open(url, "_blank");
}

// ==============================
// Ürün parse
// ==============================
function parseProduct(v){
  if(!v) return "-";
  try{
    if(v.startsWith("[") && v.endsWith("]")){
      return JSON.parse(v).join(", ");
    }
  }catch{}
  return v;
}

// ==============================
// Sipariş Aç
// ==============================
async function openOrder(id){
  const { data, error } = await db.from(TABLE).select("*").eq("siparis_no", id).single();
  if(error || !data){ toast("Sipariş bulunamadı"); return; }

  selectedOrder = data;
  renderDetailsView();
  document.getElementById("orderModal").style.display="flex";
}
function closeModal(){
  document.getElementById("orderModal").style.display="none";
}

// ==============================
// Sipariş Detayı
// ==============================
function renderDetailsView(){
  const d = selectedOrder;

  document.getElementById("orderDetails").innerHTML = `
    <p><b>No:</b> ${d.siparis_no}</p>
    <p><b>İsim:</b> ${d.ad_soyad}</p>
    <p><b>Sipariş Alan Tel:</b> ${d.siparis_tel}</p>
    <p><b>Müşteri Tel:</b> ${d.musteri_tel}</p>
    <p><b>Adres:</b> ${d.adres}</p>

    <p>
      <b>Şehir / İlçe:</b> ${d.sehir} / ${d.ilce}
      <button class="btn-mini" onclick="queryCityDistrictCodes()">Sor</button>
      <br>
      <small>Kodlar: ${d.sehir_kodu ?? "-"} / ${d.ilce_kodu ?? "-"}</small>
    </p>

    <p><b>Ürün:</b> ${parseProduct(d.urun_bilgisi)}</p>
    <p><b>Adet:</b> ${d.kargo_adet ?? "-"}</p>
    <p><b>KG:</b> ${d.kargo_kg ?? "-"}</p>
    <p><b>Tutar:</b> ${d.toplam_tutar} TL</p>
    <p><b>Ödeme:</b> ${d.odeme_sekli}</p>
    <p><b>Sipariş Alan:</b> ${d.siparis_alan ?? "-"}</p>
    <p><b>Not:</b> ${d.notlar ?? "-"}</p>
  `;

  const isIptal = d.kargo_durumu==="İptal";
  const isKargo = d.kargo_durumu==="Kargolandı";
  const isTamam = d.kargo_durumu==="Tamamlandı";

  document.getElementById("btnPrepare").style.display = (d.kargo_durumu==="Bekliyor") ? "inline-block":"none";
  document.getElementById("btnCargo").style.display   = (d.kargo_durumu==="Hazırlandı") ? "inline-block":"none";
  document.getElementById("btnBarcode").style.display = isKargo ? "inline-block":"none";
  document.getElementById("btnWaiting").style.display = (d.kargo_durumu !== "Bekliyor" && d.kargo_durumu!=="Kargolandı") ? "inline-block":"none";

  document.getElementById("actionButtons").style.display = isIptal ? "none":"flex";
  document.getElementById("restoreButtons").style.display= isIptal ? "flex":"none";

  if(isTamam){
    document.getElementById("btnPrepare").style.display="none";
    document.getElementById("btnCargo").style.display="none";
    document.getElementById("btnBarcode").style.display="none";
    document.getElementById("btnWaiting").style.display="none";
    document.querySelector("#actionButtons .btn-warning").style.display="none";
    document.querySelector("#actionButtons .btn-danger").style.display="none";
  }

  document.getElementById("editButtons").style.display="none";
  document.getElementById("cancelForm").style.display="none";
}

// ==============================
// ŞEHİR - İLÇE KOD SORGULAMA
// ==============================
async function queryCityDistrictCodes(){
  if(!selectedOrder) return;

  toast("Kodlar sorgulanıyor...");

  const res = await fetch(WH_SEHIR_ILCE, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(selectedOrder)
  });

  if(!res.ok){
    toast("Sorgulama hatası!");
    return;
  }

  const data = await res.json();

  await db.from(TABLE)
    .update({
      sehir_kodu: data.sehir_kodu,
      ilce_kodu: data.ilce_kodu
    })
    .eq("siparis_no", selectedOrder.siparis_no);

  toast("Şehir/İlçe kodları güncellendi");
  openOrder(selectedOrder.siparis_no); // yenile
}

// ==============================
// DÜZENLEME MODU
// ==============================
function enterEditMode(){
  const d = selectedOrder;
  document.getElementById("orderDetails").innerHTML = `
    <div class="edit-grid">
      <div class="form-group">
        <label>Ad Soyad</label><input id="ad_soyad" value="${d.ad_soyad ?? ""}">
      </div>
      <div class="form-group">
        <label>Sipariş Alan Tel</label><input id="siparis_tel" value="${d.siparis_tel ?? ""}">
      </div>
      <div class="form-group">
        <label>Müşteri Tel</label><input id="musteri_tel" value="${d.musteri_tel ?? ""}">
      </div>
      <div class="form-group full-row">
        <label>Adres</label><textarea id="adres">${d.adres ?? ""}</textarea>
      </div>
      <div class="form-group">
        <label>Şehir</label><input id="sehir" value="${d.sehir ?? ""}">
      </div>
      <div class="form-group">
        <label>İlçe</label><input id="ilce" value="${d.ilce ?? ""}">
      </div>
      <div class="form-group">
        <label>Kargo Adet</label><input id="kargo_adet" value="${d.kargo_adet ?? ""}">
      </div>
      <div class="form-group">
        <label>Kargo KG</label><input id="kargo_kg" value="${d.kargo_kg ?? ""}">
      </div>
      <div class="form-group full-row">
        <label>Ürün</label><textarea id="urun_bilgisi">${d.urun_bilgisi ?? ""}</textarea>
      </div>
      <div class="form-group">
        <label>Tutar</label><input id="toplam_tutar" value="${d.toplam_tutar ?? ""}">
      </div>
      <div class="form-group">
        <label>Ödeme</label><input id="odeme_sekli" value="${d.odeme_sekli ?? ""}">
      </div>
      <div class="form-group full-row">
        <label>Not</label><textarea id="notlar">${d.notlar ?? ""}</textarea>
      </div>
    </div>`;

  document.getElementById("actionButtons").style.display="none";
  document.getElementById("editButtons").style.display="flex";
}

async function saveEdit(){
  const updated = {
    ad_soyad: ad_soyad.value,
    siparis_tel: siparis_tel.value,
    musteri_tel: musteri_tel.value,
    adres: adres.value,
    sehir: sehir.value,
    ilce: ilce.value,
    kargo_adet: kargo_adet.value,
    kargo_kg: kargo_kg.value,
    urun_bilgisi: urun_bilgisi.value,
    toplam_tutar: toplam_tutar.value,
    odeme_sekli: odeme_sekli.value,
    notlar: notlar.value
  };

  await db.from(TABLE).update(updated).eq("siparis_no", selectedOrder.siparis_no);
  toast("Değişiklikler kaydedildi");
  closeModal(); loadOrders(true);
}

function cancelEdit(){
  renderDetailsView();
  document.getElementById("editButtons").style.display="none";
  document.getElementById("actionButtons").style.display="flex";
}

// ==============================
// Hazırla → Adisyon Yazdır
// ==============================
async function markPrepared(){
  await db.from(TABLE)
    .update({kargo_durumu:"Hazırlandı"})
    .eq("siparis_no", selectedOrder.siparis_no);

  printSiparis(selectedOrder);

  toast("Sipariş Hazırlandı");
  closeModal(); loadOrders(true);
}

// ==============================
// Kargola
// ==============================
async function sendToCargo(){
  const ok = await confirmModal({
    title:"Kargoya Gönder",
    text:"Sipariş KARGOLANDI olarak işaretlenecek.",
    confirmText:"Evet",
    cancelText:"Hayır"
  });
  if(!ok) return;

  // double submit
  const key = selectedOrder.siparis_no;
  if(busy.kargola.has(key)){
    toast("Bu sipariş zaten işleniyor.");
    return;
  }
  busy.kargola.add(key);

  try{
    await fetch(WH_KARGOLA, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(selectedOrder)
    });
    toast("Kargoya gönderildi");
  }catch(e){
    toast("Hata oluştu");
  }finally{
    setTimeout(()=>busy.kargola.delete(key), 60000);
  }
}

// ==============================
// Adisyon Yazdır
// ==============================
function printSiparis(order){
  const w = window.open("adisyon_print.html", "_blank", "width=320,height=600");

  let products = [];
  try{
    products = JSON.parse(order.urun_bilgisi);
  }catch{ products = [order.urun_bilgisi]; }

  let productRows = "";
  products.forEach((p,i)=>{
    productRows += `
      <tr>
        <td>${i+1}. ${p}</td>
        <td style="text-align:right;">1</td>
      </tr>`;
  });

  const html = `
    <div class="box">
      <div class="row"><b>Sipariş No:</b> ${order.siparis_no}</div>
      <div class="row"><b>İsim:</b> ${order.ad_soyad}</div>
      <div class="row"><b>Tel:</b> ${order.musteri_tel}</div>
      <div class="row"><b>Adres:</b> ${order.adres}</div>
      <div class="row"><b>Şehir/İlçe:</b> ${order.sehir} / ${order.ilce}</div>
    </div>

    <div class="box">
      <b>ÜRÜNLER</b>
      <table>
        <tr><th>Ürün</th><th style="text-align:right;">Adet</th></tr>
        ${productRows}
        <tr class="total-row">
          <td>Toplam:</td>
          <td style="text-align:right;">${order.kargo_adet ?? 1}</td>
        </tr>
      </table>
    </div>

    <div class="box">
      <div class="row"><b>Ödeme:</b> ${order.odeme_sekli}</div>
      <div class="row"><b>Tutar:</b> ${order.toplam_tutar} TL</div>
      <div class="row"><b>Tarih:</b> ${new Date().toLocaleString("tr-TR")}</div>
      <div class="row"><b>Not:</b> ${order.notlar || "-"}</div>
    </div>
  `;

  w.onload = () => {
    w.document.getElementById("content").innerHTML = html;
    if(typeof w.doPrint==="function") w.doPrint();
  }
}

// ==============================
// Barkod Yazdır
// ==============================
function printBarcode(){
  const b64 = selectedOrder.zpl_base64;
  const w = window.open("barkod_print.html", "_blank");
  w.onload = ()=> w.showBarcode(b64);
}

// ==============================
// İPTAL
// ==============================
function openCancelForm(){
  if(selectedOrder.kargo_durumu==="Kargolandı"){
    const wrap = document.createElement("div");
    wrap.className="alert-backdrop";

    wrap.innerHTML = `
      <div class="alert-card" style="max-width:600px;">
        <div class="alert-title">Kargolanmış Siparişi İptal Et</div>
        <div class="alert-text">Bu sipariş kargo firmasına iletilmiş.</div>

        <b>İptal Nedeni</b>
        <textarea id="iptalNedeniKargo" style="width:100%;height:90px;margin-top:10px;"></textarea>

        <div class="alert-actions" style="margin-top:20px;">
          <button class="btn-brand" id="iptalGonder">İptal Et</button>
          <button class="btn-ghost" id="iptalVazgec">Vazgeç</button>
        </div>
      </div>
    `;

    document.getElementById("alertRoot").appendChild(wrap);

    wrap.querySelector("#iptalVazgec").onclick = ()=> wrap.remove();
    wrap.querySelector("#iptalGonder").onclick = ()=>{
      const reason = document.getElementById("iptalNedeniKargo").value.trim();
      if(!reason) return toast("Neden gerekli");
      wrap.remove();
      confirmCancelKargolu(reason);
    };
    return;
  }

  document.getElementById("cancelForm").style.display="block";
  document.getElementById("actionButtons").style.display="none";
}

function cancelCancelForm(){
  document.getElementById("cancelForm").style.display="none";
  document.getElementById("actionButtons").style.display="flex";
}

async function confirmCancel(){
  const reason = document.getElementById("iptalInput").value.trim();
  if(!reason) return toast("İptal nedeni gerekli");

  await fetch(WH_IPTAL,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({...selectedOrder, reason})
  });

  await db.from(TABLE)
    .update({kargo_durumu:"İptal", iptal_nedeni:reason, iptal_tarihi:new Date().toISOString()})
    .eq("siparis_no", selectedOrder.siparis_no);

  toast("Sipariş iptal edildi");
  closeModal(); loadOrders(true);
}

async function confirmCancelKargolu(reason){
  await fetch(WH_IPTAL,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({...selectedOrder, reason})
  });

  await db.from(TABLE)
    .update({kargo_durumu:"İptal", iptal_nedeni:reason, iptal_tarihi:new Date().toISOString()})
    .eq("siparis_no", selectedOrder.siparis_no);

  toast("Kargolanmış sipariş iptal edildi");
  closeModal(); loadOrders(true);
}

// ==============================
// Restore
// ==============================
async function restoreOrder(){
  await db.from(TABLE)
    .update({kargo_durumu:"Bekliyor", iptal_nedeni:null, iptal_tarihi:null})
    .eq("siparis_no", selectedOrder.siparis_no);

  toast("Sipariş geri alındı");
  closeModal(); loadOrders(true);
}

// ==============================
// TAB-Menü
// ==============================
function setTab(tab){
  currentTab = tab;
  document.querySelectorAll(".menu li").forEach(li=>li.classList.remove("active"));
  document.getElementById(`tab_${tab}`).classList.add("active");
  loadOrders(true);
}

function loadMore(){
  currentPage++;
  loadOrders(false);
}

// ==============================
// ARAMA
// ==============================
async function searchOrders(){
  const q = document.getElementById("searchInput").value.trim();
  if(!q) return loadOrders(true);

  const { data, error } = await db.from(TABLE)
    .select("*")
    .or(`
      siparis_no.eq.${q},
      ad_soyad.ilike.%${q}%,
      musteri_tel.ilike.%${q}%,
      siparis_tel.ilike.%${q}%,
      adres.ilike.%${q}%,
      kargo_takip_kodu.ilike.%${q}%
    `);

  if(error){ toast("Arama hatası"); return; }

  renderTable(data);
}

function clearSearch(){
  document.getElementById("searchInput").value="";
  loadOrders(true);
}

// ==============================
// Mobile Menu
// ==============================
function toggleMenu(){
  document.querySelector(".sidebar").classList.toggle("open");
}

document.addEventListener("click", function(e){
  const sidebar = document.querySelector(".sidebar");
  const menuBtn = document.querySelector(".mobile-menu-btn");

  if(!sidebar.classList.contains("open")) return;
  if(sidebar.contains(e.target) || menuBtn.contains(e.target)) return;

  sidebar.classList.remove("open");
});

// ==============================
// INIT
// ==============================
loadOrders(true);
