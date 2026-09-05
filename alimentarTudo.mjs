import pkg from 'pg';
const { Pool } = pkg;

const CONEXAO_NEON = process.env.CONEXAO_NEON || "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";
const TAXA_DOLAR = 5.60;

// Cota simétrica exata por termo em cada loja
const QUANTIDADE_POR_TERMO = 10;

const pool = new Pool({
  connectionString: CONEXAO_NEON,
  ssl: { rejectUnauthorized: false }
});

// Matriz de Produtos: Hardware Tradicional + Ecossistema Maker
const MATRIZ_PRODUTOS = [
  // Hardware & Periféricos
  { termo: 'placa de video', categoria: 'Placa de Vídeo' },
  { termo: 'processador ryzen', categoria: 'Processador' },
  { termo: 'monitor gamer', categoria: 'Monitor' },
  { termo: 'teclado mecanico', categoria: 'Teclado' },
  { termo: 'mouse gamer', categoria: 'Mouse' },
  { termo: 'headset gamer', categoria: 'Headset' },

  // Maker & Microcontroladores
  { termo: 'esp32', categoria: 'ESP32 & Maker' },
  { termo: 'arduino uno', categoria: 'Arduino & Maker' },
  { termo: 'raspberry pi pico', categoria: 'Raspberry & Maker' },
  { termo: 'modulo sensor arduino', categoria: 'Sensores & Maker' }
];

// 1. Ingestão Mercado Livre
async function coletarMercadoLivre(itemMatriz) {
  const { termo, categoria } = itemMatriz;
  const offset = Math.floor(Math.random() * 2) * 20;
  const url = `https://mercado-libre4.p.rapidapi.com/search?country=BR&search=${encodeURIComponent(termo)}&offset=${offset}&limit=25`;

  let salvos = 0;
  try {
    const res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'mercado-libre4.p.rapidapi.com'
      }
    });
    const dados = await res.json();
    const lista = Array.isArray(dados) ? dados : (dados.results || []);

    for (const item of lista) {
      if (salvos >= QUANTIDADE_POR_TERMO) break;

      const nome = item.title;
      let preco = 0;
      if (typeof item.price === 'number') {
        preco = item.price;
      } else if (typeof item.price === 'object' && item.price !== null) {
        preco = parseFloat(item.price.amount || item.price.value || 0);
      } else {
        preco = parseFloat(item.price) || 0;
      }

      let link = item.permalink || item.url || '';
      let imagem = item.thumbnail ? item.thumbnail.replace('http://', 'https://').replace('-I.jpg', '-O.jpg') : '';

      if (nome && preco > 0) {
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

// 2. Ingestão AliExpress
async function coletarAliExpress(itemMatriz) {
  const { termo, categoria } = itemMatriz;
  const pagina = Math.floor(Math.random() * 2) + 1;
  const url = 'https://aliexpress-product-data-api1.p.rapidapi.com/aliexpress/v1/search';

  let salvos = 0;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'aliexpress-product-data-api1.p.rapidapi.com'
      },
      body: JSON.stringify({
        query: termo,
        country: 'BR',
        currency: 'BRL',
        sort: 'best_match',
        page: pagina,
        max_results: 25
      })
    });

    const dados = await res.json();
    const lista = dados.data?.results || [];

    for (const item of lista) {
      if (salvos >= QUANTIDADE_POR_TERMO) break;

      const nome = item.title;
      let precoBruto = item.price?.value || item.sale_price || item.targetSalePrice || item.price || 0;
      let preco = typeof precoBruto === 'string' ? parseFloat(precoBruto.replace(/[^\d.,]/g, '').replace(',', '.')) : parseFloat(precoBruto) || 0;

      let link = item.url || '';
      if (link.startsWith('//')) link = 'https:' + link;

      let imagem = item.image || (item.images && item.images[0]) || '';
      if (imagem.startsWith('//')) imagem = 'https:' + imagem;

      if (nome && preco > 0 && link) {
        const q = await pool.query(
          `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [String(item.product_id || Math.random()), nome, preco, categoria, 'AliExpress', link, imagem]
        );
        if (q.rowCount > 0) salvos++;
      }
    }
  } catch (err) {
    console.error(`Erro AliExpress [${termo}]:`, err.message);
  }
  return salvos;
}

// 3. Ingestão eBay (Nova Rota: ebay-api7.p.rapidapi.com)
async function coletarEbay(itemMatriz) {
  const { termo, categoria } = itemMatriz;
  const pagina = Math.floor(Math.random() * 2) + 1;
  const url = `https://ebay-api7.p.rapidapi.com/search?query=${encodeURIComponent(termo)}&page=${pagina}`;

  let salvos = 0;
  try {
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'ebay-api7.p.rapidapi.com'
      }
    });
    const dados = await res.json();
    const lista = dados.items || [];

    for (const item of lista) {
      if (salvos >= QUANTIDADE_POR_TERMO) break;

      const nome = item.title;
      
      // Captura o preço do eBay (em objeto, número ou string) e converte para BRL
      let precoBruto = 0;
      if (item.price) {
        if (typeof item.price === 'number') {
          precoBruto = item.price;
        } else if (typeof item.price === 'object') {
          precoBruto = parseFloat(item.price.value || item.price.amount || 0);
        } else {
          precoBruto = parseFloat(String(item.price).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        }
      }

      let precoBRL = Math.round(precoBruto * TAXA_DOLAR * 100) / 100;
      let link = item.item_url || item.url || item.itemUrl || '';
      let imagem = item.thumbnail || item.image || item.imageUrl || '';

      if (nome && precoBRL > 0) {
        const q = await pool.query(
          `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [String(item.item_id || item.id || Math.random()), nome, precoBRL, categoria, 'eBay', link, imagem]
        );
        if (q.rowCount > 0) salvos++;
      }
    }
  } catch (err) {
    console.error(`Erro eBay [${termo}]:`, err.message);
  }
  return salvos;
}

// Orquestrador central simétrico
async function rodarIngestaoSincronizada() {
  console.log("=== INICIANDO INGESTÃO SIMÉTRICA (1:1:1) ===");
  console.log(`Cota alvo: ${QUANTIDADE_POR_TERMO} produtos por termo em cada loja.\n`);

  let totais = { 'Mercado Livre': 0, 'AliExpress': 0, 'eBay': 0 };

  for (const item of MATRIZ_PRODUTOS) {
    console.log(`▶ Processando termo: "${item.termo}" [${item.categoria}]`);

    const qMl = await coletarMercadoLivre(item);
    totais['Mercado Livre'] += qMl;
    console.log(`  - Mercado Livre: +${qMl} salvos`);

    const qAli = await coletarAliExpress(item);
    totais['AliExpress'] += qAli;
    console.log(`  - AliExpress:    +${qAli} salvos`);

    const qEbay = await coletarEbay(item);
    totais['eBay'] += qEbay;
    console.log(`  - eBay:          +${qEbay} salvos (em BRL)`);
  }

  console.log("\n=== BALANÇO FINAL DO CICLO ===");
  console.table(totais);
  await pool.end();
}

rodarIngestaoSincronizada();
