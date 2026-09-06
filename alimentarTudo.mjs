import pkg from 'pg';
const { Pool } = pkg;

const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const RAPIDAPI_KEY = "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";

const pool = new Pool({
  connectionString: CONEXAO_NEON,
  ssl: { rejectUnauthorized: false }
});

const QUANTIDADE_POR_TERMO = 8;

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

// Pisos realistas para barrar peças avulsas de anúncios múltiplos (ex: fios, cases ou parafusos)
const PISOS_CATEGORIA = {
  'Mouses': 20.00,
  'Teclados': 35.00,
  'Headsets': 30.00,
  'Monitores': 250.00,
  'Placas de Vídeo': 500.00,
  'Processadores': 200.00,
  'ESP32 & Maker': 6.00,
  'Arduino & Maker': 12.00,
  'Raspberry & Maker': 40.00,
  'Sensores & Maker': 1.20
};

function converterPreco(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'object') {
    return converterPreco(val.amount || val.value || val.price || val.raw);
  }
  if (typeof val === 'string') {
    let limpo = val.replace(/[^\d.,]/g, '').trim();
    if (!limpo) return 0;
    if (limpo.includes(',') && limpo.includes('.')) {
      if (limpo.lastIndexOf(',') > limpo.lastIndexOf('.')) {
        limpo = limpo.replace(/\./g, '').replace(',', '.');
      } else {
        limpo = limpo.replace(/,/g, '');
      }
    } else if (limpo.includes(',')) {
      limpo = limpo.replace(',', '.');
    }
    return parseFloat(limpo) || 0;
  }
  return 0;
}

// 1. Mercado Livre
async function coletarMercadoLivre(itemMatriz) {
  const { termo, categoria } = itemMatriz;
  const url = `https://mercado-libre4.p.rapidapi.com/search?country=BR&search=${encodeURIComponent(termo)}&offset=0&limit=20`;

  let salvos = 0;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'mercado-libre4.p.rapidapi.com'
      }
    });

    if (!res.ok) return 0;
    const dados = await res.json();
    const lista = Array.isArray(dados) ? dados : dados.results || [];

    for (const item of lista) {
      if (salvos >= QUANTIDADE_POR_TERMO) break;

      const nome = item.title || item.name;
      const preco = converterPreco(item.price?.amount || item.price || item.sale_price);

      let imagem = item.thumbnail || '';
      if (imagem.includes('http://')) imagem = imagem.replace('http://', 'https://');
      if (imagem.includes('-I.jpg')) imagem = imagem.replace('-I.jpg', '-O.jpg');
      const link = item.permalink || item.url || '';

      const piso = PISOS_CATEGORIA[categoria] || 2.00;
      if (nome && preco >= piso && link) {
        const idItem = String(item.id || Math.random());
        const q = await pool.query(
          `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [idItem, nome, preco, categoria, 'Mercado Livre', link, imagem]
        );
        if (q.rowCount > 0) salvos++;
      }
    }
  } catch (err) {
    console.error(`Erro ML [${termo}]:`, err.message);
  }
  return salvos;
}

// 2. AliExpress
async function coletarAliExpress(itemMatriz) {
  const { termo, categoria } = itemMatriz;
  const url = `https://aliexpress-datahub.p.rapidapi.com/item_search_2?q=${encodeURIComponent(termo)}&page=1&sort=default`;

  let salvos = 0;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'aliexpress-datahub.p.rapidapi.com'
      }
    });

    if (!res.ok) return 0;
    const dados = await res.json();
    const lista = dados.result?.resultList || dados.data || [];

    for (const raw of lista) {
      if (salvos >= QUANTIDADE_POR_TERMO) break;
      const item = raw.item || raw;

      const nome = item.title || item.name;
      const precoFinal = converterPreco(
        item.targetSalePrice ||
        item.promotionPrice ||
        item.salePrice ||
        item.sku?.def?.promotionPrice ||
        item.sku?.def?.price ||
        item.price
      );

      let link = item.itemUrl || item.url || '';
      if (link && !link.startsWith('http')) link = `https:${link}`;
      let imagem = item.image || item.pic || '';
      if (imagem && !imagem.startsWith('http')) imagem = `https:${imagem}`;

      const piso = PISOS_CATEGORIA[categoria] || 2.00;
      if (nome && precoFinal >= piso && link) {
        const idProduto = String(item.itemId || item.id || Math.random());
        const q = await pool.query(
          `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [idProduto, nome, precoFinal, categoria, 'AliExpress', link, imagem]
        );
        if (q.rowCount > 0) salvos++;
      }
    }
  } catch (err) {
    console.error(`Erro AliExpress [${termo}]:`, err.message);
  }
  return salvos;
}

// 3. eBay
async function coletarEbay(itemMatriz) {
  const { termo, categoria } = itemMatriz;
  const url = `https://ebay-search-result.p.rapidapi.com/search/${encodeURIComponent(termo)}?page=1`;

  let salvos = 0;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'ebay-search-result.p.rapidapi.com'
      }
    });

    if (!res.ok) return 0;
    const dados = await res.json();
    const lista = Array.isArray(dados) ? dados : dados.results || dados.items || [];

    for (const item of lista) {
      if (salvos >= QUANTIDADE_POR_TERMO) break;

      const nome = item.title || item.name;
      const precoUsd = converterPreco(item.price || item.currentPrice);
      const precoBrl = Math.round(precoUsd * 5.75 * 100) / 100;

      const link = item.url || item.link || item.itemUrl || '';
      let imagem = item.image || item.thumbnail || item.imageUrl || '';
      if (imagem.startsWith('http://')) imagem = imagem.replace('http://', 'https://');

      const piso = PISOS_CATEGORIA[categoria] || 2.00;
      if (nome && precoBrl >= piso && link) {
        const idItem = String(item.id || item.itemId || item.epid || Math.random());
        const q = await pool.query(
          `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [idItem, nome, precoBrl, categoria, 'eBay', link, imagem]
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
  console.log("=== SINCRONIZANDO CATÁLOGO MERCHEAP ===");
  let totais = { 'Mercado Livre': 0, 'AliExpress': 0, 'eBay': 0 };

  for (const item of MATRIZ_BUSCA) {
    console.log(`\nProcessando categoria: ${item.categoria} ("${item.termo}")...`);

    const qML = await coletarMercadoLivre(item);
    totais['Mercado Livre'] += qML;
    console.log(`  - Mercado Livre: +${qML} inseridos`);

    const qAli = await coletarAliExpress(item);
    totais['AliExpress'] += qAli;
    console.log(`  - AliExpress:    +${qAli} inseridos`);

    const qEbay = await coletarEbay(item);
    totais['eBay'] += qEbay;
    console.log(`  - eBay (BRL):    +${qEbay} inseridos`);

    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("\n=========================================");
  console.log("CARGA FINALIZADA!");
  console.log(`Mercado Livre : +${totais['Mercado Livre']}`);
  console.log(`AliExpress    : +${totais['AliExpress']}`);
  console.log(`eBay          : +${totais['eBay']}`);
  console.log("=========================================");

  await pool.end();
}

rodarIngestaoSincronizada();
