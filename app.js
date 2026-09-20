const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let cats = [];
let products = [];
let cart = [];
let info = {};
let catObserver = null;

document.addEventListener('DOMContentLoaded', () => {
  const splashEl = document.getElementById('splash');
  setTimeout(() => {
    splashEl.classList.add('hide');
    setTimeout(() => splashEl.remove(), 650);
  }, 1800);
  load();
});

async function load() {
  if (SUPABASE_URL.includes('COLE_AQUI')) return demo();
  try {
    let a = await Promise.all([
      db.from('business_info').select('*').order('id', { ascending: false }).limit(1).maybeSingle(),
      db.from('categories').select('*').order('sort_order'),
      db.from('products').select('*').eq('available', true).order('sort_order')
    ]);
    if (a.some(x => x.error)) throw a.find(x => x.error).error;
    info = a[0].data || {};
    cats = a[1].data || [];
    products = a[2].data || [];
    render();
  } catch (e) {
    console.error(e);
    demo();
  }
}

function demo() {
  info = {
    name: 'Café Conffe Cafeteria',
    tagline: 'Seja Bem-Vindo!',
    main_title: 'Uma pausa para saborear',
    description: 'Cafés selecionados e delícias preparadas com carinho para você aproveitar cada momento.',
    whatsapp: '5511999999999',
    footer_text: 'Todos os direitos reservados.'
  };
  cats = [
    { id: '1', name: 'Salgados', support_text: 'Feitos na hora' },
    { id: '2', name: 'Doces', support_text: 'Um carinho doce' },
    { id: '3', name: 'Bebidas', support_text: 'Para acompanhar' }
  ];
  products = [
    { id: '1', category_id: '1', name: 'Coxinha cremosa', description: 'Frango temperado e requeijão cremoso', price: 9.9 },
    { id: '2', category_id: '1', name: 'Empada artesanal', description: 'Massa amanteigada com frango desfiado', price: 8.5 },
    { id: '3', category_id: '2', name: 'Fatia de chocolate', description: 'Massa úmida e brigadeiro artesanal', price: 14.9 },
    { id: '4', category_id: '2', name: 'Brownie da casa', description: 'Chocolate intenso e casquinha crocante', price: 10 },
    { id: '5', category_id: '3', name: 'Refrigerante lata', description: '350 ml, bem gelado', price: 6 },
    { id: '6', category_id: '3', name: 'Suco natural', description: 'Preparado na hora', price: 9.9 }
  ];
  render();
}

function render() {
  document.title = info.name || 'Cardápio';
  name.textContent = info.name || 'Café Conffe Cafeteria';
  tagline.textContent = info.tagline || '';
  title.textContent = info.main_title || 'Uma pausa para saborear';
  desc.textContent = info.description || '';
  footer.textContent = info.footer_text || '';
  address.textContent = info.address || '';

  if (info.logo_url) {
    logo.src = info.logo_url;
    splashLogo.src = info.logo_url;
  }

  if (info.instagram) {
    insta.href = info.instagram;
    insta.classList.remove('d-none');
  }

  catsEl();

  menu.innerHTML = cats.map(c => `
    <section class="category" id="c${c.id}">
      <h2>${esc(c.name)}</h2>
      <div class="support">${esc(c.support_text || '')}</div>
      <div class="row g-3">
        ${products.filter(p => String(p.category_id) == String(c.id)).map(card).join('')}
      </div>
    </section>
  `).join('');

  observeCats();
}

// Monta o menu de categorias e liga o clique de cada item
function catsEl() {
  catsElRef.innerHTML = cats.map(c => `<a href="#c${c.id}" data-cat="${c.id}">${esc(c.name)}</a>`).join('');

  catsElRef.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      goToCat(a.dataset.cat);
    });
  });
}

// Rola até a categoria clicada, já marcando ela como ativa e
// "silenciando" o observador de rolagem até a rolagem terminar
// (evita que o menu fique trocando pelas categorias do meio do caminho)
// Também começa "silenciado" ao carregar a página, pra nenhum item vir
// marcado como ativo sozinho antes do usuário rolar ou clicar.
let suppressObserver = true;
let programmaticScroll = false;
let suppressTimer = null;

function goToCat(id) {
  const target = document.getElementById('c' + id);
  if (!target) return;

  setActiveCat(id);
  suppressObserver = true;
  programmaticScroll = true;
  clearTimeout(suppressTimer);

  target.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const release = () => {
    suppressObserver = false;
    programmaticScroll = false;
  };

  if ('onscrollend' in window) {
    const onEnd = () => {
      release();
      window.removeEventListener('scrollend', onEnd);
    };
    window.addEventListener('scrollend', onEnd);
  } else {
    // Navegadores sem suporte a "scrollend": usa um tempo de segurança
    suppressTimer = setTimeout(release, 700);
  }
}

// Assim que o usuário rolar a página por conta própria (mouse, toque,
// teclado, barra de rolagem), libera o observador. Rolagens feitas pelo
// próprio clique no menu (goToCat) não contam, pra não conflitar.
window.addEventListener('scroll', () => {
  if (!programmaticScroll) suppressObserver = false;
}, { passive: true });

// Marca visualmente qual categoria está selecionada no menu
function setActiveCat(id) {
  catsElRef.querySelectorAll('a').forEach(a => {
    a.classList.toggle('active', a.dataset.cat === String(id));
  });
}

// Observa o scroll da página e atualiza o menu conforme a categoria visível
function observeCats() {
  if (catObserver) catObserver.disconnect();

  const sections = document.querySelectorAll('.category');
  if (!sections.length) return;

  catObserver = new IntersectionObserver(entries => {
    if (suppressObserver) return;
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        setActiveCat(entry.target.id.replace('c', ''));
      }
    });
  }, { rootMargin: '-110px 0px -65% 0px', threshold: 0 });

  sections.forEach(s => catObserver.observe(s));
}

const catsElRef = document.getElementById('cats');
const menu = document.getElementById('menu');

function card(p) {
  return `
    <div class="col-12 col-md-6">
      <article class="product">
        <img src="${p.image_url || 'assets/img/product-placeholder.svg'}" onerror="this.src='assets/img/product-placeholder.svg'">
        <div class="product-body">
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.description || '')}</p>
          <div class="bottom">
            <span class="price">${money(p.price)}</span>
            <button class="add" onclick="add('${p.id}')">+ Adicionar</button>
          </div>
        </div>
      </article>
    </div>
  `;
}

window.add = id => {
  let p = products.find(x => String(x.id) == String(id));
  let x = cart.find(x => String(x.id) == String(id));
  x ? x.q++ : cart.push({ ...p, q: 1 });
  drawCart();
  bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('cart')).show();
};

window.remove = i => {
  cart.splice(i, 1);
  drawCart();
};

function drawCart() {
  let n = cart.reduce((a, x) => a + x.q, 0);
  let t = cart.reduce((a, x) => a + x.q * Number(x.price), 0);
  count.textContent = n;
  total.textContent = money(t);
  items.innerHTML = cart.length
    ? cart.map((x, i) => `
        <div class="item">
          <div>
            <strong>${x.q}x ${esc(x.name)}</strong>
            <small>${money(x.q * x.price)}</small>
          </div>
          <button class="remove" onclick="remove(${i})"><i class="bi bi-trash"></i></button>
        </div>
      `).join('')
    : '<p class="text-center text-secondary mt-5">Seu pedido está vazio.</p>';
}

send.onclick = () => {
  if (!cart.length) return alert('Adicione algum produto.');

  let phone = (info.whatsapp || '').replace(/\D/g, '');
  if (!phone) return alert('Configure o WhatsApp no painel.');

  let t = cart.reduce((a, x) => a + x.q * Number(x.price), 0);
  let msg = 'Olá! Gostaria de fazer um pedido:%0A%0A' +
    cart.map(x => `• ${x.q}x ${x.name} - ${money(x.q * x.price)}`).join('%0A') +
    `%0A%0A*Total: ${money(t)}*`;

  let note = document.getElementById('note').value.trim();
  if (note) msg += `%0A%0AObservação: ${note}`;

  open('https://wa.me/' + phone + '?text=' + msg, '_blank');
};

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
