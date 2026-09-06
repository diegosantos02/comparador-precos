import pkg from 'pg';
const { Pool } = pkg;

const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const RAPIDAPI_KEY = "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";

const pool = new Pool({
  connectionString: CONEXAO_NEON,
  ssl: { rejectUnauthorized: false }
});

const QUANTIDADE_POR_TERMO = 10;

// Matriz Normalizada com Categorias Alinhadas
const MATRIZ_BUSCA = [
  { termo: 'mouse gamer', categoria: 'Mouses' },
  { termo: 'teclado mecanico', categoria: 'Teclados' },
  { termo: 'headset gamer', categoria: 'Headsets' },
  { termo: 'monitor gamer', categoria: 'Monitores' },
  { termo: 'placa de video rtx', categoria: 'Placas de Vídeo' },
  { termo: 'processador ryzen', categoria: 'Processadores' },
  { termo: 'esp32 wifi bluetooth', categoria: 'ESP32 & Maker' },
  { termo: 'arduino uno r3', categoria: 'Arduino & Maker' },
  { termo: 'raspberry pi 4', categoria: 'Raspberry & Maker' },
  { termo: 'sensor modulo arduino', categoria: 'Sensores & Maker' }
];

function numeroAleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 1. Mercado Livre (Variação aleatória por offset)
async function coletarMercadoLivre(itemMatriz) {
  const { termo, categoria } = itemMatriz;
  const offsetAleatorio = numeroAleatorio(0, 3) * 10; // 0, 10, 20 ou 30
  const url = `https://mercado-libre4.p.rapidapi.com/search?country=BR&search=${encodeURIComponent(termo)}&offset=${offsetAleatorio}&limit=20`;

  let salvos = 0;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'mercado-libre4.p.rapidapi.com'
      }
    });

    const dados = await res.json();
    const lista = Array.isArray(dados) ? dados : dados.results || [];

    for (const item of lista) {
      if (salvos >= QUANTIDADE_POR_TERMO) break;

      const nome = item.title || item.name;
      const preco = parseFloat(item.price?.amount || item.price) || 0;
      let imagem = item.thumbnail || '';
      if (imagem.includes('http://')) imagem = imagem.replace('http://', 'https://');
      if (imagem.includes('-I.jpg')) imagem = imagem.replace('-I.jpg', '-O.jpg');
      const link = item.permalink || item.url || '';

      if (nome && preco > 0 && link) {
        const q = await pool.query(
          `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [String(item.id || Math.random()), nome, preco, categoria, 'Mercado Livre', link, imagem]
        );
        if (q.rowCount > 0) salvos++;
      }
    }
  } catch (err) {
    console.error(`Erro ML [${termo}]:`, err.message);
  }
  return salvos;
}

// 2. AliExpress (Variação aleatória por página)
async function coletarAliExpress(itemMatriz) {
  const { termo, categoria } = itemMatriz;
  const paginaAleatoria = numeroAleatorio(1, 4); // Páginas 1 a 4
  const url = `https://aliexpress-datahub.p.rapidapi.com/item_search_2?q=${encodeURIComponent(termo)}&page=${paginaAleatoria}&sort=default`;

  let salvos = 0;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'aliexpress-datahub.p.rapidapi.com'
      }
    });

    const dados = await res.json();
    const lista = dados.result?.resultList || dados.data || [];

    for (const item of lista) {
      if (salvos >= QUANTIDADE_POR_TERMO) break;

      const prod = item.item || item;
      const nome = prod.title || prod.name;
      let preco = 0;
      const precoBruto = prod.sku?.def?.promotionPrice || prod.sku?.def?.price || prod.price;

      if (typeof precoBruto === 'string') {
        let limpo = precoBruto.replace(/[^\d.,]/g, '');
        if (limpo.includes(',') && limpo.includes('.')) {
          limpo = limpo.replace(/\./g, '').replace(',', '.');
        } else if (limpo.includes(',')) {
          limpo = limpo.replace(',', '.');
        }
        preco = parseFloat(limpo) || 0;
      } else {
        preco = parseFloat(precoBruto) || 0;
      }

      let link = prod.itemUrl || prod.url || '';
      if (link && !link.startsWith('http')) link = `https:${link}`;
      let imagem = prod.image || prod.pic || '';
      if (imagem && !imagem.startsWith('http')) imagem = `https:${imagem}`;

      if (nome && preco > 0 && link) {
        const q = await pool.query(
          `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [String(prod.itemId || prod.id || Math.random()), nome, preco, categoria, 'AliExpress', link, imagem]
        );
        if (q.rowCount > 0) salvos++;
      }
    }
  } catch (err) {
    console.error(`Erro AliExpress [${termo}]:`, err.message);
  }
  return salvos;
}

// 3. eBay (Variação aleatória por offset de listagem com conversão BRL)
async function coletarEbay(itemMatriz) {
  const { termo, categoria } = itemMatriz;
  const offsetAleatorio = numeroAleatorio(0, 3) * 10;
  const url = `https://ebay-search-result.p.rapidapi.com/search/${encodeURIComponent(termo)}?offset=${offsetAleatorio}&limit=20`;

  let salvos = 0;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'ebay-search-result.p.rapidapi.com'
      }
    });

    const dados = await res.json();
    const lista = dados.results || dados.items || [];

    for (const item of lista) {
      if (salvos >= QUANTIDADE_POR_TERMO) break;

      const nome = item.title;
      let precoUsd = 0;
      const precoBruto = item.price;

      if (typeof precoBruto === 'string') {
        const limpo = precoBruto.replace(/[^\d.]/g, '');
        precoUsd = parseFloat(limpo) || 0;
      } else {
        precoUsd = parseFloat(precoBruto) || 0;
      }

      const precoBrl = Math.round(precoUsd * 5.75 * 100) / 100;
      const link = item.url || item.link || '';
      const imagem = item.image || item.thumbnail || '';

      if (nome && precoBrl > 0 && link) {
        const q = await pool.query(
          `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [String(item.id || item.itemId || Math.random()), nome, precoBrl, categoria, 'eBay', link, imagem]
        );
        if (q.rowCount > 0) salvos++;
      }
    }
  } catch (err) {
    console.error(`Erro eBay [${termo}]:`, err.message);
  }
  return salvos;
}

async function rodarIngestaoSincronizada() {
  console.log("=== INICIANDO ALIMENTAÇÃO RANDÔMICA MERCHEAP ===");
  let totais = { 'Mercado Livre': 0, 'AliExpress': 0, 'eBay': 0 };

  for (const item of MATRIZ_BUSCA) {
    console.log(`\nProcessando categoria: ${item.categoria} ("${item.termo}")...`);

    const qML = await coletarMercadoLivre(item);
    totais['Mercado Livre'] += qML;
    console.log(`  - Mercado Livre: +${qML} salvos`);

    const qAli = await coletarAliExpress(item);
    totais['AliExpress'] += qAli;
    console.log(`  - AliExpress:    +${qAli} salvos`);

    const qEbay = await coletarEbay(item);
    totais['eBay'] += qEbay;
    console.log(`  - eBay (BRL):    +${qEbay} salvos`);

    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log("\n=========================================");
  console.log("CARGA FINALIZADA COM SUCESSO!");
  console.log(`Mercado Livre : +${totais['Mercado Livre']} itens`);
  console.log(`AliExpress    : +${totais['AliExpress']} itens`);
  console.log(`eBay          : +${totais['eBay']} itens`);
  console.log("=========================================");

  await pool.end();
}

rodarIngestaoSincronizada();
