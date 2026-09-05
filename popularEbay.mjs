import pkg from 'pg';
const { Pool } = pkg;

const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const RAPIDAPI_KEY = "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";
const RAPIDAPI_HOST = "real-time-ebay-data2.p.rapidapi.com";

const pool = new Pool({
  connectionString: CONEXAO_NEON,
  ssl: { rejectUnauthorized: false }
});

const categoriasTech = ['gaming keyboard rgb', 'wireless gaming mouse', 'gaming headset'];

async function popularEbay() {
  console.log("Iniciando busca automática de produtos no eBay via RapidAPI...");
  let totalInseridos = 0;

  for (const termo of categoriasTech) {
    console.log(`\nBuscando "${termo}" no eBay...`);
    try {
      const url = `https://${RAPIDAPI_HOST}/search?query=${encodeURIComponent(termo)}&page=1&domain=com&sort_by=BEST_MATCH&buying_format=buy_it_now`;

      const resposta = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
          'Content-Type': 'application/json'
        }
      });

      const dados = await resposta.json();
      const lista = dados.data?.products || dados.products || dados.data || [];

      if (!Array.isArray(lista) || lista.length === 0) {
        console.log(`Nenhum item retornado para "${termo}". Resposta bruta:`, JSON.stringify(dados).substring(0, 120));
        continue;
      }

      // Salva até 10 produtos legítimos por termo
      for (const item of lista.slice(0, 10)) {
        const idProduto = String(item.product_id || item.item_id || item.id || Math.random());
        const nome = item.title || item.name;

        let preco = 0;
        const precoBruto = item.price?.value || item.price || item.current_price || 0;
        if (typeof precoBruto === 'string') {
          preco = parseFloat(precoBruto.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        } else {
          preco = parseFloat(precoBruto) || 0;
        }

        const link = item.url || item.item_url || item.product_url;
        const imagem = item.image || item.thumbnail || (item.images && item.images[0]) || '';

        if (nome && preco > 0 && link && imagem) {
          await pool.query(
            `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING`,
            [idProduto, nome, preco, termo, 'eBay', link, imagem]
          );
          totalInseridos++;
          console.log(`Salvo eBay: ${nome.substring(0, 35)}... | $ ${preco}`);
        }
      }
    } catch (err) {
      console.error(`Erro ao consultar termo ${termo}:`, err.message);
    }
  }

  console.log(`\nCarga concluída! ${totalInseridos} produtos gravados do eBay no NeonDB.`);
  await pool.end();
}

popularEbay();
