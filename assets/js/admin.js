const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let cats = [];
let products = [];
let info = null;
let editId = null;
let modal;

document.addEventListener('DOMContentLoaded', async () => {
  modal = new bootstrap.Modal(productModal);
  loginForm.onsubmit = login;
  logout.onclick = async () => {
    await db.auth.signOut();
    location.reload();
  };
  newProduct.onclick = () => openProduct();
  categoryForm.onsubmit = addCat;
  pImage.onchange = preview;
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
            <input id="o${c.id}" type="number" class="form-control" value="${c.sort_order || 1}">
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
  let sort_order = +document.getElementById('o' + id).value || 1;
  let r = await db.from('categories').update({ name, slug, support_text, sort_order }).eq('id', id);
  if (r.error) return alert(r.error.message);
  load();
};

window.delCat = async id => {
  if (products.some(p => String(p.category_id) == String(id))) return alert('Remova ou mova os produtos desta categoria primeiro.');
  if (confirm('Excluir categoria?')) {
    let r = await db.from('categories').delete().eq('id', id);
    if (r.error) alert(r.error.message);
    else load();
  }
};

async function addCat(e) {
  e.preventDefault();
  let name = catName.value.trim();
  let slug = catSlug.value.trim() || slugify(name);
  let support_text = catSupport.value.trim();
  let sort_order = +catOrder.value || 1;
  let r = await db.from('categories').insert({ name, slug, support_text, sort_order });
  if (r.error) return alert(r.error.message);
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
          <button class="btn btn-sm btn-outline-secondary" onclick="openProduct(null,'${c.id}')">+ Adicionar</button>
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
  previewImg.classList.add('d-none');
  fillSelect();

  if (id) {
    let p = products.find(x => String(x.id) == String(id));
    pName.value = p.name;
    pPrice.value = p.price;
    pDesc.value = p.description || '';
    pCat.value = p.category_id;
    pOrder.value = p.sort_order || 1;
    pAvailable.checked = p.available !== false;
    if (p.image_url) {
      previewImg.src = p.image_url;
      previewImg.classList.remove('d-none');
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

function preview(e) {
  if (!e.target.files[0]) return;
  previewImg.src = URL.createObjectURL(e.target.files[0]);
  previewImg.classList.remove('d-none');
}

productForm.onsubmit = async e => {
  e.preventDefault();
  let image_url = editId ? (products.find(p => String(p.id) == String(editId))?.image_url || null) : null;
  let file = pImage.files[0];

  try {
    if (file) {
      let path = 'products/' + crypto.randomUUID() + '.' + file.name.split('.').pop().toLowerCase();
      let u = await db.storage.from(SUPABASE_BUCKET).upload(path, file);
      if (u.error) throw u.error;
      image_url = db.storage.from(SUPABASE_BUCKET).getPublicUrl(path).data.publicUrl;
    }

    let payload = {
      name: pName.value.trim(),
      price: +pPrice.value,
      description: pDesc.value.trim(),
      category_id: pCat.value,
      sort_order: +pOrder.value || 1,
      available: pAvailable.checked,
      image_url
    };

    let r = editId
      ? await db.from('products').update(payload).eq('id', editId)
      : await db.from('products').insert(payload);

    if (r.error) throw r.error;

    modal.hide();
    load();
  } catch (x) {
    pMsg.textContent = x.message;
  }
};

window.delProduct = async id => {
  if (!confirm('Excluir produto?')) return;
  let r = await db.from('products').delete().eq('id', id);
  if (r.error) alert(r.error.message);
  else load();
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
      ? await db.from('business_info').update(p).eq('id', info.id)
      : await db.from('business_info').insert(p);

    if (r.error) throw r.error;
    infoMsg.textContent = ' Salvo!';
    load();
  } catch (x) {
    infoMsg.textContent = x.message;
  }
};

function slugify(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
