(() => {
  const ADMIN_EMAIL = "ah10med2013@gmail.com";
  const ADMIN_USER_ID = "4d5aa877-61d8-486e-9dda-4e30c8d04d29";
  const isSareeAdmin = () => String(session?.user?.email || "").toLowerCase() === ADMIN_EMAIL && session?.user?.id === ADMIN_USER_ID;
  let chatRefreshTimer = null;
  const oldRenderNav = renderNav;
  renderNav = function () {
    oldRenderNav();
    const box = $("#navActions");
    if (box && session?.user) box.insertAdjacentHTML("afterbegin", '<a class="btn soft" href="#/inbox">الرسائل</a>');
    if (box && isSareeAdmin()) box.insertAdjacentHTML("afterbegin", '<a class="btn soft" href="#/admin">لوحة الإدارة</a>');
  };
  function showFeedback() {
    $("#app").innerHTML = `<div class="wrap page"><div class="panel feedback-panel"><div class="eyebrow">نسمع منك</div><h1 class="page-title">الشكاوى واقتراحات تطوير للموقع</h1><p class="sub">أرسل ملاحظتك لفريق سريع. الاسم والهاتف والبريد اختيارية.</p><form id="feedbackForm" class="top-gap"><div class="form-grid"><div class="field"><label>الاسم — اختياري</label><input name="name" maxlength="100" autocomplete="name"></div><div class="field"><label>رقم الهاتف — اختياري</label><input name="phone" inputmode="tel" maxlength="40" autocomplete="tel"></div></div><div class="field"><label>البريد الإلكتروني — اختياري</label><input name="email" type="email" maxlength="254" autocomplete="email"></div><div class="field"><label>عنوان الشكوى أو الاقتراح</label><input name="subject" required maxlength="160"></div><div class="field"><label>التفاصيل</label><textarea name="message" required minlength="10" maxlength="5000" rows="7"></textarea></div><button class="btn primary">إرسال</button></form></div></div>`;
  }
  async function loadInbox() {
    if(!session?.user){ $("#app").innerHTML='<div class="wrap page"><div class="empty">سجّل الدخول لعرض رسائلك.</div></div>'; return; }
    $("#app").innerHTML='<div class="wrap page"><h1 class="page-title">رسائلي</h1><div id="inboxList" class="top-gap"><div class="loading">جارٍ تحميل المحادثات…</div></div></div>';
    const meId=session.user.id;
    const {data,error}=await db.from("site_messages").select("id,sender_id,recipient_id,body,created_at,read_at").or("sender_id.eq."+meId+",recipient_id.eq."+meId).order("created_at",{ascending:false}).limit(500);
    if(error){showError(error);return;} const rows=data||[]; const contacts=[...new Set(rows.map(m=>m.sender_id===meId?m.recipient_id:m.sender_id))];
    if(!contacts.length){$("#inboxList").innerHTML='<div class="empty">لا توجد محادثات بعد. افتح صفحة مقدم خدمة لبدء محادثة.</div>';return;}
    const people=await db.from("profiles").select("id,username,first_name,last_name,avatar_path").in("id",contacts); if(people.error){showError(people.error);return;}
    const pmap=new Map((people.data||[]).map(p=>[p.id,p])); const newest=new Map(); for(const m of rows){const other=m.sender_id===meId?m.recipient_id:m.sender_id;if(!newest.has(other))newest.set(other,m);}
    $("#inboxList").innerHTML=contacts.map(id=>{const p=pmap.get(id)||{};const m=newest.get(id);const unread=rows.filter(x=>x.sender_id===id&&x.recipient_id===meId&&!x.read_at).length;return '<a class="panel inbox-row" href="#/chat/'+esc(id)+'"><span><strong>'+esc((p.first_name||'')+' '+(p.last_name||''))+'</strong><small class="muted"> @'+esc(p.username||'مستخدم')+' · '+esc(m?.body||'')+'</small></span>'+(unread?'<span class="tag">'+unread+' جديدة</span>':'')+'</a>';}).join("");
  }
  async function loadConversation(userId) {
    if(!session?.user||! /^[0-9a-f-]{36}$/i.test(userId)){ $("#app").innerHTML='<div class="wrap page"><div class="empty">سجّل الدخول وافتح محادثة صحيحة.</div></div>'; return; }
    const person=await db.from("profiles").select("id,username,first_name,last_name").eq("id",userId).maybeSingle(); if(person.error)throw person.error;if(!person.data)throw Error("المستخدم غير موجود.");
    $("#app").innerHTML='<div class="wrap page"><a class="btn small soft" href="#/inbox">← الرسائل</a><section class="panel chat-panel top-gap"><h1 class="page-title">محادثة مع '+esc((person.data.first_name||'')+' '+(person.data.last_name||''))+'</h1><div id="chatMessages" class="chat-log"></div><form id="chatForm" data-recipient="'+esc(userId)+'" class="chat-compose"><textarea name="body" required minlength="1" maxlength="4000" rows="2" placeholder="اكتب رسالتك…"></textarea><button class="btn primary">إرسال</button></form></section></div>';
    await refreshChat(userId); if(chatRefreshTimer)clearInterval(chatRefreshTimer); chatRefreshTimer=setInterval(()=>refreshChat(userId).catch(()=>{}),10000);
  }
  async function refreshChat(userId) {
    if(!session?.user||!$("#chatMessages"))return; const meId=session.user.id;
    const {data,error}=await db.from("site_messages").select("id,sender_id,recipient_id,body,created_at,read_at").or("and(sender_id.eq."+meId+",recipient_id.eq."+userId+"),and(sender_id.eq."+userId+",recipient_id.eq."+meId+")").order("created_at",{ascending:true}).limit(500); if(error)throw error;
    const box=$("#chatMessages"); const previous=box.scrollTop+box.clientHeight>=box.scrollHeight-60;
    box.innerHTML=(data||[]).map(m=>'<div class="chat-bubble '+(m.sender_id===meId?'mine':'theirs')+'"><p>'+esc(m.body)+'</p><small>'+esc(new Date(m.created_at).toLocaleString("ar"))+'</small></div>').join("")||'<div class="empty">ابدأ المحادثة برسالة واضحة ومحترمة.</div>';
    if(previous)box.scrollTop=box.scrollHeight;
    await db.from("site_messages").update({read_at:new Date().toISOString()}).eq("sender_id",userId).eq("recipient_id",meId).is("read_at",null);
  }
  async function sendChat(form) {
    if(!session?.user)throw Error("سجّل الدخول لإرسال رسالة."); const v=Object.fromEntries(new FormData(form)); const body=String(v.body||"").trim();if(!body)throw Error("اكتب رسالة أولًا.");
    const recipient=form.dataset.recipient;const {error}=await db.from("site_messages").insert({sender_id:session.user.id,recipient_id:recipient,body});if(error)throw error;form.reset();await refreshChat(recipient);
  }
  async function showNotifications() {
    $("#app").innerHTML = '<div class="wrap page"><h1 class="page-title">الإشعارات</h1><div id="notificationsList" class="top-gap"><div class="loading">جارٍ التحميل…</div></div></div>';
    const {data,error}=await db.from("site_notifications").select("id,title,message,created_at").order("created_at",{ascending:false}).limit(100); if(error){showError(error);return;}
    $("#notificationsList").innerHTML=data?.length?data.map(n=>`<article class="panel notification-card"><strong>${esc(n.title)}</strong><p>${esc(n.message)}</p><small class="muted">${esc(n.created_at?new Date(n.created_at).toLocaleString("ar"):"")}</small></article>`).join(""):'<div class="empty">لا توجد إشعارات لك الآن.</div>';
  }
  async function showAdmin() {
    if (!isSareeAdmin()) { $("#app").innerHTML = '<div class="wrap page"><div class="empty">هذه الصفحة غير متاحة لهذا الحساب.</div></div>'; return; }
    $("#app").innerHTML = '<div class="wrap page"><div class="section-head"><div><h1 class="page-title">لوحة إدارة سريع</h1><p class="sub">إدارة الشكاوى والاقتراحات والإشعارات.</p></div></div><div class="panel"><h2>إرسال إشعار</h2><form id="noticeForm"><div class="field"><label>عنوان الإشعار</label><input name="title" required maxlength="160"></div><div class="field"><label>نص الإشعار</label><textarea name="message" required minlength="2" maxlength="3000"></textarea></div><div class="field"><label>المستهدفون</label><select name="audience"><option value="all">جميع المستخدمين</option><option value="users">مستخدمون محددون</option></select></div><div class="field" id="targetUsersField" hidden><label>معرّفات المستخدمين (UUID)، افصل بينها بفواصل</label><textarea name="target_user_ids" placeholder="UUID, UUID"></textarea></div><button class="btn primary">نشر الإشعار</button></form></div><div class="panel top-gap"><h2>إدارة الخدمات والتمييز الأسبوعي</h2><div id="adminServices"><div class="loading">جارٍ تحميل الخدمات…</div></div></div><div class="panel top-gap"><h2>الشكاوى والاقتراحات</h2><div id="adminFeedback"><div class="loading">جارٍ تحميل الرسائل…</div></div></div></div>';
    try {
      const {data,error}=await db.from("site_feedback").select("*").order("created_at",{ascending:false}).limit(200); if(error) throw error;
      const list=$("#adminFeedback");
      list.innerHTML=data?.length ? data.map(row=>`<article class="feedback-row"><div class="section-head"><strong>${esc(row.subject)}</strong><span class="tag">${esc(row.status)}</span></div><p class="content-text">${esc(row.message)}</p><small class="muted">${esc(row.created_at ? new Date(row.created_at).toLocaleString("ar") : "")} · ${esc(row.name || "بدون اسم")} · ${esc(row.email || "بدون بريد")} · ${esc(row.phone || "بدون هاتف")}</small><div class="inline-controls"><select data-feedback-status="${esc(row.id)}"><option value="new" ${row.status==="new"?"selected":""}>جديدة</option><option value="in_progress" ${row.status==="in_progress"?"selected":""}>قيد المتابعة</option><option value="resolved" ${row.status==="resolved"?"selected":""}>تم الحل</option><option value="closed" ${row.status==="closed"?"selected":""}>مغلقة</option></select><button class="btn small soft" data-action="feedback-save" data-id="${esc(row.id)}">حفظ الحالة</button></div></article>`).join("") : '<div class="empty">لا توجد رسائل حتى الآن.</div>';
      const services=await db.from("services").select("id,title,is_featured,featured_until").order("created_at",{ascending:false}).limit(300); if(services.error) throw services.error;
      $("#adminServices").innerHTML=services.data?.length?services.data.map(s=>{const active=Boolean(s.is_featured&&s.featured_until&&new Date(s.featured_until).getTime()>Date.now());return '<div class="admin-service-row"><span><strong>'+esc(s.title)+'</strong> <small class="muted">'+(active?'مميز حتى '+esc(new Date(s.featured_until).toLocaleDateString("ar")):'غير مميز')+'</small></span><button class="btn small '+(active?'danger':'soft')+'" data-action="feature-service" data-id="'+esc(s.id)+'" data-featured="'+(active?'true':'false')+'">'+(active?'إلغاء التمييز':'تمييز ٧ أيام')+'</button></div>';}).join(""):'<div class="empty">لا توجد خدمات بعد.</div>';
    } catch(error) { showError(error); }
  }
  async function putNotice(form) {
    if(!isSareeAdmin()) throw Error("غير مصرح."); const v=Object.fromEntries(new FormData(form)); const audience=v.audience; const target=audience==="users" ? String(v.target_user_ids||"").split(",").map(x=>x.trim()).filter(Boolean) : [];
    if(audience==="users" && (!target.length || target.some(id=>!/[0-9a-f-]{36}/i.test(id)))) throw Error("أدخل UUID صحيحًا لكل مستخدم مستهدف.");
    const {error}=await db.from("site_notifications").insert({title:v.title.trim(),message:v.message.trim(),audience,target_user_ids:target,created_by:session.user.id}); if(error) throw error; form.reset(); $("#targetUsersField").hidden=true; toast("تم نشر الإشعار.");
  }
  async function putFeedback(form) {
    const v=Object.fromEntries(new FormData(form)); const {error}=await db.from("site_feedback").insert({sender_id:session?.user?.id||null,name:v.name.trim()||null,phone:v.phone.trim()||null,email:v.email.trim().toLowerCase()||null,subject:v.subject.trim(),message:v.message.trim()}); if(error) throw error; form.reset(); toast("وصلت رسالتك إلى الإدارة، شكرًا لك.");
  }
  const oldRoute = route;
  route = function () {
    if(chatRefreshTimer){clearInterval(chatRefreshTimer);chatRefreshTimer=null;}
    const parts=decodeURIComponent(location.hash.replace(/^#\/?/,"")).split("/"); const page=parts[0];
    if(page==="inbox") return loadInbox();
    if(page==="chat" && parts[1]) return loadConversation(parts[1]);
    if(page==="feedback") return showFeedback();
    if(page==="notifications") return showNotifications();
    if(page==="admin") return showAdmin();
    return oldRoute();
  };
  document.addEventListener("click",async event=>{
    const b=event.target.closest("[data-action]"); if(!b) return;
    try {
      if(b.dataset.action==="menu-toggle") { const menu=$("#siteMenu"); const open=!menu.classList.contains("open"); menu.classList.toggle("open",open); b.setAttribute("aria-expanded",String(open)); return; }
      if(b.dataset.action==="site-chat" || b.dataset.action==="open-chat") { if(!session?.user){openAuth("login");throw Error("سجّل الدخول لبدء المحادثة.");} location.hash="#/chat/"+b.dataset.userId; }
      if(b.dataset.action==="feature-service") { if(!isSareeAdmin())throw Error("غير مصرح.");const featured=b.dataset.featured==="true";const update=featured?{is_featured:false,featured_until:null}:{is_featured:true,featured_until:new Date(Date.now()+7*24*60*60*1000).toISOString()};const {error}=await db.from("services").update(update).eq("id",b.dataset.id);if(error)throw error;toast(featured?"تم إلغاء التمييز.":"تم تمييز الخدمة لمدة ٧ أيام.");await showAdmin(); }
      if(b.dataset.action==="feedback-save") { if(!isSareeAdmin()) throw Error("غير مصرح."); const status=$(`[data-feedback-status="${b.dataset.id}"]`).value; const {error}=await db.from("site_feedback").update({status}).eq("id",b.dataset.id); if(error) throw error; toast("تم تحديث الحالة."); }
    } catch(error) { showError(error); }
  });
  document.addEventListener("click",event=>{if(event.target.closest("#siteMenu a")){const menu=$("#siteMenu"),button=$("[data-action=menu-toggle]");menu?.classList.remove("open");button?.setAttribute("aria-expanded","false");}else if(!event.target.closest("#siteMenu")&&!event.target.closest("[data-action=menu-toggle]")){const menu=$("#siteMenu"),button=$("[data-action=menu-toggle]");menu?.classList.remove("open");button?.setAttribute("aria-expanded","false");}});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"){const menu=$("#siteMenu"),button=$("[data-action=menu-toggle]");menu?.classList.remove("open");button?.setAttribute("aria-expanded","false");}});
  document.addEventListener("change",event=>{if(event.target.name==="audience"){const f=$("#targetUsersField");if(f)f.hidden=event.target.value!=="users";}});
  document.addEventListener("submit",async event=>{const form=event.target;if(!["feedbackForm","noticeForm","chatForm"].includes(form.id))return;event.preventDefault();const button=form.querySelector("button[type=submit],button:not([type])");if(button)button.disabled=true;try{if(form.id==="feedbackForm")await putFeedback(form);else if(form.id==="chatForm")await sendChat(form);else await putNotice(form);}catch(error){showError(error);}finally{if(button)button.disabled=false;}});
  document.addEventListener("DOMContentLoaded",()=>{});
  renderNav();
  route();
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
})();
