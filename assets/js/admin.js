const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let cats = [];
let products = [];
let info = null;
let editId = null;
let modal;

// Mostra um popup (toast) rápido no canto da tela, pra dar feedback
// visual de sucesso/erro sem travar a tela como o alert() nativo.
function toast(message, type = 'success') {
  let box = document.getElementById('toastBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toastBox';
    document.body.appendChild(box);
  }

  let el = document.createElement('div');
  el.className = 'toast-msg ' + type;
  el.textContent = message;
  box.appendChild(el);

  requestAnimationFrame(() => el.classList.add('show'));

  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// Enquadrador de foto do produto: deixa arrastar e dar zoom antes de
// enviar, pra escolher o melhor ângulo/posição em vez de recortar
// automaticamente. O quadro (320x240, proporção 4:3) é a mesma
// proporção usada nos cards do cardápio.
const CROP_W = 320;
const CROP_H = 240;
const cropCanvas = document.getElementById('cropCanvas');
const cropCtx = cropCanvas.getContext('2d');

let cropImg = null;
let cropScale = 1;
let cropMinScale = 1;
let cropOffsetX = 0;
let cropOffsetY = 0;
let cropDragging = false;
let cropDragStart = null;
let cropDirty = false;

function loadImageFrom(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function openCropper(src) {
  try {
    cropImg = await loadImageFrom(src);
  } catch {
    cropperWrap.classList.add('d-none');
    return;
  }
  cropMinScale = Math.max(CROP_W / cropImg.width, CROP_H / cropImg.height);
  cropScale = cropMinScale;
  cropOffsetX = 0;
  cropOffsetY = 0;
  cropZoom.min = cropMinScale;
  cropZoom.max = cropMinScale * 3;
  cropZoom.step = (cropMinScale * 2) / 100;
  cropZoom.value = cropMinScale;
  cropperWrap.classList.remove('d-none');
  drawCrop();
}

function closeCropper() {
  cropImg = null;
  cropDirty = false;
  cropperWrap.classList.add('d-none');
}

function clampCropOffsets() {
  const drawW = cropImg.width * cropScale;
  const drawH = cropImg.height * cropScale;
  const maxX = Math.max(0, (drawW - CROP_W) / 2);
  const maxY = Math.max(0, (drawH - CROP_H) / 2);
  cropOffsetX = Math.min(maxX, Math.max(-maxX, cropOffsetX));
  cropOffsetY = Math.min(maxY, Math.max(-maxY, cropOffsetY));
}

function drawCrop() {
  if (!cropImg) return;
  clampCropOffsets();
  const drawW = cropImg.width * cropScale;
  const drawH = cropImg.height * cropScale;
  const x = (CROP_W - drawW) / 2 - cropOffsetX;
  const y = (CROP_H - drawH) / 2 - cropOffsetY;
  cropCtx.clearRect(0, 0, CROP_W, CROP_H);
  cropCtx.drawImage(cropImg, x, y, drawW, drawH);
}

// Converte a posição do ponteiro (em pixels de tela) pra pixels do
// canvas, considerando que ele pode estar exibido em outro tamanho.
function cropPointerPos(e) {
  const rect = cropCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (CROP_W / rect.width),
    y: (e.clientY - rect.top) * (CROP_H / rect.height)
  };
}

cropZoom.oninput = () => {
  cropScale = +cropZoom.value;
  cropDirty = true;
  drawCrop();
};

cropCanvas.addEventListener('pointerdown', e => {
  if (!cropImg) return;
  cropDragging = true;
  const p = cropPointerPos(e);
  cropDragStart = { x: p.x, y: p.y, offX: cropOffsetX, offY: cropOffsetY };
  cropCanvas.setPointerCapture(e.pointerId);
});

cropCanvas.addEventListener('pointermove', e => {
  if (!cropDragging) return;
  const p = cropPointerPos(e);
  cropOffsetX = cropDragStart.offX - (p.x - cropDragStart.x);
  cropOffsetY = cropDragStart.offY - (p.y - cropDragStart.y);
  cropDirty = true;
  drawCrop();
});

cropCanvas.addEventListener('pointerup', () => { cropDragging = false; });
cropCanvas.addEventListener('pointercancel', () => { cropDragging = false; });

// Gera a imagem final (em boa resolução) com o enquadramento escolhido
function getCroppedBlob() {
  const OUT_W = 1000;
  const OUT_H = 750;
  const ratio = OUT_W / CROP_W;
  const out = document.createElement('canvas');
  out.width = OUT_W;
  out.height = OUT_H;
  const octx = out.getContext('2d');
  const drawW = cropImg.width * cropScale * ratio;
  const drawH = cropImg.height * cropScale * ratio;
  const x = (OUT_W - drawW) / 2 - cropOffsetX * ratio;
  const y = (OUT_H - drawH) / 2 - cropOffsetY * ratio;
  octx.drawImage(cropImg, x, y, drawW, drawH);
  return new Promise(resolve => out.toBlob(resolve, 'image/jpeg', 0.9));
}

// Sai sozinho depois de um tempo sem uso, por segurança (o painel
// fica logado indefinidamente por padrão, então isso limita o risco
// de alguém mexer no computador com a sessão aberta).
const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 minutos
let idleTimer = null;

function resetIdleTimer() {
  if (!idleTimer && app.classList.contains('d-none')) return; // ainda não logou
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await db.auth.signOut();
    sessionStorage.setItem('idleLogout', '1');
    location.reload();
  }, IDLE_LIMIT_MS);
}

function startIdleWatch() {
  idleTimer = setTimeout(() => {}, 0); // marca que o watch está ativo
  resetIdleTimer();
  ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, resetIdleTimer, { passive: true });
  });
}

function stopIdleWatch() {
  clearTimeout(idleTimer);
  idleTimer = null;
}

document.addEventListener('DOMContentLoaded', async () => {
  if (sessionStorage.getItem('idleLogout')) {
    sessionStorage.removeItem('idleLogout');
    toast('Você foi desconectado por inatividade.', 'error');
  }

  modal = new bootstrap.Modal(productModal);
  loginForm.onsubmit = login;
  logout.onclick = async () => {
    if (!confirm('Tem certeza que deseja sair?')) return;
    stopIdleWatch();
    await db.auth.signOut();
    location.reload();
  };
  categoryForm.onsubmit = addCat;
  pImage.onchange = () => {
    if (!pImage.files[0]) return;
    cropDirty = true;
    openCropper(URL.createObjectURL(pImage.files[0]));
  };
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => tab(b.dataset.tab));

  // Se já existir uma sessão ativa (login anterior), entra direto
  let s = (await db.auth.getSession()).data.session;
  if (s) enter(s);
});

async function login(e) {
  e.preventDefault();
  let r = await db.auth.signInWithPassword({ email: email.value, password: pass.value });
  if (r.error) return loginMsg.textContent = r.error.message;
  enter(r.data.session);
}

async function enter(s) {
  loginScreen.classList.add('d-none');
  app.classList.remove('d-none');
  userEmail.textContent = s.user.email;
  startIdleWatch();
  await load();
}

async function load() {
  let r = await Promise.all([
    db.from('categories').select('*').order('sort_order'),
    db.from('products').select('*').order('sort_order'),
    db.from('business_info').select('*').order('id', { ascending: false }).limit(1).maybeSingle()
  ]);

  let [catsRes, productsRes, infoRes] = r;
  let errs = [];

  if (catsRes.error) errs.push('categorias: ' + catsRes.error.message);
  else cats = catsRes.data || [];

  if (productsRes.error) errs.push('produtos: ' + productsRes.error.message);
  else products = productsRes.data || [];

  if (infoRes.error) errs.push('informações: ' + infoRes.error.message);
  else info = infoRes.data || {};

  if (errs.length) alert('Não consegui carregar tudo:\n\n' + errs.join('\n') + '\n\nVerifique as permissões (RLS/Data API) dessa(s) tabela(s) no Supabase.');

  if (!info) info = {};

  renderCats();
  renderProducts();
  fillInfo();
  fillSelect();
}

function tab(x) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab == x));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id == x));
}

function renderCats() {
  categoryList.innerHTML = cats.map(c => `
    <div class="col-12 col-lg-6">
      <div class="cat-card">
        <div class="row g-2">
          <div class="col-6">
            <label>Nome</label>
            <input id="n${c.id}" class="form-control" value="${esc(c.name)}">
          </div>
          <div class="col-6">
            <label>Identificador</label>
            <input id="s${c.id}" class="form-control" value="${esc(c.slug || '')}">
          </div>
          <div class="col-7">
            <label>Texto de apoio</label>
            <input id="t${c.id}" class="form-control" value="${esc(c.support_text || '')}">
          </div>
          <div class="col-5">
            <label>Ordem</label>
            <input id="o${c.id}" type="number" min="1" step="1" class="form-control" value="${c.sort_order || 1}">
          </div>
        </div>
        <div class="cat-actions">
          <button class="btn btn-sm btn-outline-danger" onclick="delCat('${c.id}')">Excluir</button>
          <button class="btn btn-sm btn-primary" onclick="saveCat('${c.id}')">Salvar</button>
        </div>
      </div>
    </div>
  `).join('');
}

window.saveCat = async id => {
  let name = document.getElementById('n' + id).value.trim();
  let slug = document.getElementById('s' + id).value.trim() || slugify(name);
  let support_text = document.getElementById('t' + id).value.trim();
  let sort_order = Math.max(1, +document.getElementById('o' + id).value || 1);
  let r = await db.from('categories').update({ name, slug, support_text, sort_order }).eq('id', id).select();
  if (r.error) return toast(r.error.message, 'error');
  if (!r.data || !r.data.length) return toast('Nada foi salvo: 0 linhas afetadas (verifique a política de UPDATE do RLS).', 'error');
  toast('Categoria atualizada!');
  load();
};

window.delCat = async id => {
  if (products.some(p => String(p.category_id) == String(id))) return toast('Remova ou mova os produtos desta categoria primeiro.', 'error');
  if (confirm('Excluir categoria?')) {
    let r = await db.from('categories').delete().eq('id', id).select();
    if (r.error) return toast(r.error.message, 'error');
    if (!r.data || !r.data.length) return toast('Nada foi excluído: 0 linhas afetadas (verifique a política de DELETE do RLS).', 'error');
    toast('Categoria excluída!');
    load();
  }
};

async function addCat(e) {
  e.preventDefault();
  let name = catName.value.trim();
  let slug = catSlug.value.trim() || slugify(name);
  let support_text = catSupport.value.trim();
  let sort_order = Math.max(1, +catOrder.value || 1);
  let r = await db.from('categories').insert({ name, slug, support_text, sort_order });
  if (r.error) return toast(r.error.message, 'error');
  toast('Categoria criada!');
  e.target.reset();
  load();
}

function renderProducts() {
  productList.innerHTML = cats.map(c => {
    let ps = products.filter(p => String(p.category_id) == String(c.id));
    return `
      <div class="group">
        <div class="group-title">
          <h2>${esc(c.name)}</h2>
          <button class="btn btn-sm btn-primary" onclick="openProduct(null,'${c.id}')">+ Adicionar</button>
        </div>
        <div class="row g-2">
          ${ps.map(p => `
            <div class="col-12 col-md-6">
              <div class="prod">
                <img src="${p.image_url || 'assets/img/product-placeholder.svg'}">
                <div class="prod-info">
                  <h3>${esc(p.name)} ${p.available ? '' : '<small>(oculto)</small>'}</h3>
                  <p>${esc(p.description || '')}</p>
                  <b>${money(p.price)}</b>
                </div>
                <div class="actions">
                  <button class="icon" onclick="openProduct('${p.id}')"><i class="bi bi-pencil"></i></button>
                  <button class="icon danger" onclick="delProduct('${p.id}')"><i class="bi bi-trash"></i></button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

window.openProduct = (id = null, catId = null) => {
  editId = id;
  pId.value = id || '';
  pImage.value = '';
  closeCropper();
  fillSelect();

  if (id) {
    let p = products.find(x => String(x.id) == String(id));
    pName.value = p.name;
    pPrice.value = Number(p.price || 0).toFixed(2).replace('.', ',');
    pDesc.value = p.description || '';
    pCat.value = p.category_id;
    pOrder.value = p.sort_order || 1;
    pAvailable.checked = p.available !== false;
    if (p.image_url) {
      openCropper(p.image_url).then(() => { cropDirty = false; });
    }
  } else {
    pName.value = '';
    pPrice.value = '';
    pDesc.value = '';
    pOrder.value = 1;
    pAvailable.checked = true;
    pCat.value = catId || cats[0]?.id || '';
  }

  modal.show();
};

function fillSelect() {
  pCat.innerHTML = cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
}

productForm.onsubmit = async e => {
  e.preventDefault();
  let image_url = editId ? (products.find(p => String(p.id) == String(editId))?.image_url || null) : null;

  try {
    if (cropImg && cropDirty) {
      let blob = await getCroppedBlob();
      let path = 'products/' + crypto.randomUUID() + '.jpg';
      let u = await db.storage.from(SUPABASE_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
      if (u.error) throw u.error;
      image_url = db.storage.from(SUPABASE_BUCKET).getPublicUrl(path).data.publicUrl;
    }

    let payload = {
      name: pName.value.trim(),
      price: parsePrice(pPrice.value),
      description: pDesc.value.trim(),
      category_id: pCat.value,
      sort_order: Math.max(1, +pOrder.value || 1),
      available: pAvailable.checked,
      image_url
    };

    let r = editId
      ? await db.from('products').update(payload).eq('id', editId).select()
      : await db.from('products').insert(payload).select();

    if (r.error) throw r.error;
    if (!r.data || !r.data.length) throw new Error('Nada foi salvo: 0 linhas afetadas. Verifique a política de UPDATE/INSERT do RLS para products.');

    pMsg.textContent = '';
    toast('Produto salvo!');
    modal.hide();
    load();
  } catch (x) {
    pMsg.textContent = x.message;
    toast(x.message, 'error');
  }
};

window.delProduct = async id => {
  if (!confirm('Excluir produto?')) return;
  let r = await db.from('products').delete().eq('id', id).select();
  if (r.error) return toast(r.error.message, 'error');
  if (!r.data || !r.data.length) return toast('Nada foi excluído: 0 linhas afetadas (verifique a política de DELETE do RLS).', 'error');
  toast('Produto excluído!');
  load();
};

function fillInfo() {
  iName.value = info.name || '';
  iTag.value = info.tagline || '';
  iWhats.value = info.whatsapp || '';
  iTitle.value = info.main_title || '';
  iDesc.value = info.description || '';
  iInsta.value = info.instagram || '';
  iAddress.value = info.address || '';
  iFooter.value = info.footer_text || '';
  iLogo.value = '';

  if (info.logo_url) {
    iLogoPreview.src = info.logo_url;
    iLogoPreview.classList.remove('d-none');
  } else {
    iLogoPreview.classList.add('d-none');
  }
}

iLogo.onchange = () => {
  if (!iLogo.files[0]) return;
  iLogoPreview.src = URL.createObjectURL(iLogo.files[0]);
  iLogoPreview.classList.remove('d-none');
};

infoForm.onsubmit = async e => {
  e.preventDefault();
  try {
    let logo_url = info.logo_url || null;
    let file = iLogo.files[0];

    if (file) {
      let path = 'branding/' + crypto.randomUUID() + '.' + file.name.split('.').pop().toLowerCase();
      let u = await db.storage.from(SUPABASE_BUCKET).upload(path, file);
      if (u.error) throw u.error;
      logo_url = db.storage.from(SUPABASE_BUCKET).getPublicUrl(path).data.publicUrl;
    }

    let p = {
      name: iName.value,
      logo_url,
      tagline: iTag.value,
      whatsapp: iWhats.value,
      main_title: iTitle.value,
      description: iDesc.value,
      instagram: iInsta.value,
      address: iAddress.value,
      footer_text: iFooter.value
    };

    let r = info.id
      ? await db.from('business_info').update(p).eq('id', info.id).select()
      : await db.from('business_info').insert(p).select();

    if (r.error) throw r.error;
    if (!r.data || !r.data.length) throw new Error('Nada foi salvo: o Supabase aceitou o pedido mas não alterou nenhuma linha (0 linhas afetadas). Isso costuma ser a política de UPDATE do RLS barrando essa mudança, ou o id não existir mais na tabela.');

    infoMsg.textContent = '';
    toast('Informações salvas!');
    load();
  } catch (x) {
    infoMsg.textContent = x.message;
    toast(x.message, 'error');
  }
};

function slugify(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Aceita tanto "9,90" quanto "9.90" (o campo agora é texto livre, sem setinhas)
function parsePrice(v) {
  return parseFloat(String(v).trim().replace(',', '.')) || 0;
}

function money(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function esc(v = '') {
  return String(v).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));
}
