import pkg from 'pg';
const { Pool } = pkg;

const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const RAPIDAPI_KEY = "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";
const RAPIDAPI_HOST = "aliexpress-product-data-api1.p.rapidapi.com";

const pool = new Pool({
  connectionString: CONEXAO_NEON,
  ssl: { rejectUnauthorized: false }
});

const termosBusca = ['teclado mecanico gamer', 'mouse gamer sem fio', 'headset gamer'];

async function popularAliExpress() {
  console.log("Iniciando busca no AliExpress via RapidAPI...");
  let totalInseridos = 0;

  for (const termo of termosBusca) {
    console.log(`\nBuscando "${termo}" no AliExpress...`);
    try {
      const url = `https://${RAPIDAPI_HOST}/aliexpress/v1/search`;
      const corpo = {
        query: termo,
        country: "BR",
        currency: "BRL",
        sort: "best_match",
        page: 1,
        max_pages: 1,
        max_results: 15
      };

      const resposta = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST
        },
        body: JSON.stringify(corpo)
      });

      const dados = await resposta.json();
      
      // Mapeamento correto conforme o JSON verificado
      const lista = dados.data?.results || [];

      if (!Array.isArray(lista) || lista.length === 0) {
        console.log(`Nenhum item retornado para "${termo}".`);
        continue;
      }

      for (const item of lista.slice(0, 10)) {
        const idProduto = String(item.product_id || item.itemId || Math.random());
        const nome = item.title;

        // Trata preços em formatos variados (objeto, número ou string)
        let preco = 0;
        const precoBruto = item.price?.value || item.sale_price || item.targetSalePrice || item.price || 49.90;
        if (typeof precoBruto === 'string') {
          preco = parseFloat(precoBruto.replace(/[^\d.,]/g, '').replace(',', '.')) || 49.90;
        } else if (typeof precoBruto === 'number') {
          preco = precoBruto;
        }

        let link = item.url || '';
        if (link.startsWith('//')) link = 'https:' + link;

        let imagem = item.image || (item.images && item.images[0]) || '';
        if (imagem.startsWith('//')) imagem = 'https:' + imagem;

        if (nome && link && imagem) {
          await pool.query(
            `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING`,
            [idProduto, nome, preco, termo, 'AliExpress', link, imagem]
          );
          totalInseridos++;
          console.log(`Salvo AliExpress: ${nome.substring(0, 35)}... | R$ ${preco}`);
        }
      }
    } catch (err) {
      console.error(`Erro ao processar "${termo}":`, err.message);
    }
  }

  console.log(`\nCarga concluída! ${totalInseridos} produtos gravados do AliExpress no NeonDB.`);
  await pool.end();
}

popularAliExpress();
