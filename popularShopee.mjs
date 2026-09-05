import pkg from 'pg';
const { Pool } = pkg;

const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const RAPIDAPI_KEY = "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";
const RAPIDAPI_HOST = "shopee-product-scraper2.p.rapidapi.com";

const pool = new Pool({
  connectionString: CONEXAO_NEON,
  ssl: { rejectUnauthorized: false }
});

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const termosShopee = ['teclado gamer', 'mouse sem fio'];

async function popularShopeeAutomatico() {
  console.log("Iniciando busca automática na API da Shopee...");
  let totalInseridos = 0;

  for (const termo of termosShopee) {
    console.log(`\nEnviando requisição para termo "${termo}"...`);
    try {
      const urlBusca = `https://${RAPIDAPI_HOST}/shopee?country=BR&priceSlicing=false&maxItems=15&keywords=${encodeURIComponent(termo)}`;
      const resposta = await fetch(urlBusca, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
          'Content-Type': 'application/json'
        }
      });

      let dados = await resposta.json();
      const jobId = dados.jobId;

      if (jobId) {
        console.log(`Job registrado (ID: ${jobId}). Aguardando processamento da Shopee...`);
        let processando = true;
        let tentativas = 0;

        while (processando && tentativas < 8) {
          tentativas++;
          await esperar(5000);
          console.log(`Verificando status (Tentativa ${tentativas}/8)...`);

          const resJob = await fetch(`https://${RAPIDAPI_HOST}/jobs/${jobId}`, {
            headers: {
              'X-RapidAPI-Key': RAPIDAPI_KEY,
              'X-RapidAPI-Host': RAPIDAPI_HOST
            }
          });
          const dadosJob = await resJob.json();

          if (dadosJob.status === 'done' || (dadosJob.results && dadosJob.results.length > 0)) {
            dados = dadosJob;
            processando = false;
          } else if (dadosJob.status === 'error') {
            console.error("A tarefa falhou na Shopee.");
            break;
          }
        }
      }

      let lista = [];
      if (dados.results && Array.isArray(dados.results)) lista = dados.results;
      else if (dados.data && Array.isArray(dados.data)) lista = dados.data;
      else if (dados.items && Array.isArray(dados.items)) lista = dados.items;

      if (!lista.length) {
        console.log(`Nenhum item retornado para "${termo}".`);
        continue;
      }

      for (const item of lista) {
        const idProduto = String(item.itemId || item.id || Math.random());
        const nome = item.name || item.title;

        let preco = 0;
        const precoBruto = item.price || 0;
        if (typeof precoBruto === 'string') {
          preco = parseFloat(precoBruto.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        } else {
          preco = parseFloat(precoBruto) || 0;
        }

        const link = item.url || (item.shopid && item.itemid ? `https://shopee.com.br/product/${item.shopid}/${item.itemid}` : '');
        const imagem = (item.images && item.images.length > 0) ? item.images[0] : (item.image || '');

        if (nome && preco > 10 && link && imagem) {
          await pool.query(
            `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING`,
            [idProduto, nome, preco, termo, 'Shopee', link, imagem]
          );
          totalInseridos++;
          console.log(`Salvo Shopee: ${nome.substring(0, 35)}... | R$ ${preco}`);
        }
      }
    } catch (err) {
      console.error(`Erro ao consultar Shopee para ${termo}:`, err.message);
    }
  }

  console.log(`\nShopee finalizada! ${totalInseridos} produtos capturados da API.`);
  await pool.end();
}

popularShopeeAutomatico();
