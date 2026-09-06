import pkg from 'pg';
const { Pool } = pkg;

const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const RAPIDAPI_KEY = "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";

const pool = new Pool({
  connectionString: CONEXAO_NEON,
  ssl: { rejectUnauthorized: false }
});

const QUANTIDADE_POR_TERMO = 4;

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

// Salva ou atualiza sem depender de chave UNIQUE no PostgreSQL
async function persistirProduto(sku, nome, preco, categoria, origem, link, imagem) {
  const existe = await pool.query(
    `SELECT id FROM produtos_catalogo WHERE sku_interno = $1 AND origem = $2 LIMIT 1`,
    [sku, origem]
  );

  if (existe.rows.length > 0) {
    await pool.query(
      `UPDATE produtos_catalogo SET preco = $1, nome = $2, imagem_url = $3 WHERE id = $4`,
      [preco, nome, imagem, existe.rows[0].id]
    );
    return true;
  } else {
    await pool.query(
      `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sku, nome, preco, categoria, origem, link, imagem]
    );
    return true;
  }
}

// Consulta de detalhe para buscar a variação principal ativa
async function buscarPrecoDetalheAliExpress(itemId) {
  const url = `https://aliexpress-datahub.p.rapidapi.com/item_detail_2?itemId=${itemId}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'aliexpress-datahub.p.rapidapi.com'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.result?.item || data.data?.item;
    if (!item) return null;

    const precoFinal = converterPreco(
      item.sku?.def?.promotionPrice ||
      item.sku?.def?.price ||
      item.priceWrap?.targetSalePrice ||
      item.priceWrap?.salePrice ||
      item.price
    );
    return precoFinal > 0 ? precoFinal : null;
  } catch {
    return null;
  }
}

// 1. AliExpress (com resolução de SKU via endpoint de detalhe)
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
      const itemId = String(item.itemId || item.id || '');
      if (!itemId) continue;

      let nome = item.title || item.name;
      let link = item.itemUrl || item.url || '';
      if (link && !link.startsWith('http')) link = `https:${link}`;
      let imagem = item.image || item.pic || '';
      if (imagem && !imagem.startsWith('http')) imagem = `https:${imagem}`;

      // Consulta de detalhe para buscar a SKU principal selecionada
      await new Promise((r) => setTimeout(r, 400));
      let precoReal = await buscarPrecoDetalheAliExpress(itemId);

      if (!precoReal) {
        precoReal = converterPreco(
          item.targetSalePrice ||
          item.promotionPrice ||
          item.sku?.def?.promotionPrice ||
          item.price
        );
      }

      if (nome && precoReal > 0 && link) {
        await persistirProduto(itemId, nome, precoReal, categoria, 'AliExpress', link, imagem);
        salvos++;
      }
    }
  } catch (err) {
    console.error(`Erro AliExpress [${termo}]:`, err.message);
  }
  return salvos;
}

// 2. Mercado Livre
async function coletarMercadoLivre(itemMatriz) {
  const { termo, categoria } = itemMatriz;
  const url = `https://mercado-libre4.p.rapidapi.com/search?country=BR&search=${encodeURIComponent(termo)}&offset=0&limit=15`;

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
      const idItem = String(item.id || Math.random());

      if (nome && preco > 0 && link) {
        await persistirProduto(idItem, nome, preco, categoria, 'Mercado Livre', link, imagem);
        salvos++;
      }
    }
  } catch (err) {
    console.error(`Erro ML [${termo}]:`, err.message);
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
      const idItem = String(item.id || item.itemId || item.epid || Math.random());

      if (nome && precoBrl > 0 && link) {
        await persistirProduto(idItem, nome, precoBrl, categoria, 'eBay', link, imagem);
        salvos++;
      }
    }
  } catch (err) {
    console.error(`Erro eBay [${termo}]:`, err.message);
  }
  return salvos;
}

async function rodarIngestaoSincronizada() {
  console.log("=== SINCRONIZANDO COM RESOLUÇÃO DE SKU REAL ===");
  let totais = { 'Mercado Livre': 0, 'AliExpress': 0, 'eBay': 0 };

  for (const item of MATRIZ_BUSCA) {
    console.log(`\nProcessando: ${item.categoria} ("${item.termo}")...`);

    const qML = await coletarMercadoLivre(item);
    totais['Mercado Livre'] += qML;
    console.log(`  - Mercado Livre: +${qML} processados`);

    const qAli = await coletarAliExpress(item);
    totais['AliExpress'] += qAli;
    console.log(`  - AliExpress:    +${qAli} processados com SKU real`);

    const qEbay = await coletarEbay(item);
    totais['eBay'] += qEbay;
    console.log(`  - eBay (BRL):    +${qEbay} processados`);

    await new Promise((r) => setTimeout(r, 800));
  }

  console.log("\n=========================================");
  console.log("SINCRONIZAÇÃO COMPLETA!");
  console.log(`Mercado Livre : ${totais['Mercado Livre']}`);
  console.log(`AliExpress    : ${totais['AliExpress']}`);
  console.log(`eBay          : ${totais['eBay']}`);
  console.log("=========================================");

  await pool.end();
}

rodarIngestaoSincronizada();
