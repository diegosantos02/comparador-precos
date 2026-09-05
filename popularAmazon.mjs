import pkg from 'pg';
const { Pool } = pkg;

const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const RAPIDAPI_KEY = "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";
const RAPIDAPI_HOST = "real-time-amazon-data-the-most-complete.p.rapidapi.com";

const pool = new Pool({
  connectionString: CONEXAO_NEON,
  ssl: { rejectUnauthorized: false }
});

const termos = ['mouse gamer', 'teclado mecanico', 'headset gamer'];

async function popularAmazon() {
  console.log("Consultando Amazon via RapidAPI com nova cota...");
  let total = 0;

  for (const termo of termos) {
    console.log(`\nBuscando "${termo}" na Amazon...`);
    try {
      const url = `https://${RAPIDAPI_HOST}/search?query=${encodeURIComponent(termo)}&marketplace=BR&language=pt&page=1`;
      const resposta = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST
        }
      });

      const dados = await resposta.json();
      const lista = dados.data?.products || dados.results || [];

      if (!lista.length) {
        console.log(`Sem retorno para "${termo}". Resposta:`, JSON.stringify(dados).substring(0, 100));
        continue;
      }

      for (const item of lista.slice(0, 10)) {
        const idProduto = item.asin || item.id || String(Math.random());
        const nome = item.product_title || item.title;
        const link = item.product_url || item.url;
        const imagem = item.product_photo || item.thumbnail;

        let preco = 0;
        const precoBruto = item.product_price || item.price || 0;
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

        if (nome && preco > 0 && link && imagem) {
          await pool.query(
            `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING`,
            [idProduto, nome, preco, termo, 'Amazon', link, imagem]
          );
          total++;
          console.log(`Salvo Amazon: ${nome.substring(0, 35)}... | R$ ${preco}`);
        }
      }
    } catch (err) {
      console.error(`Erro em ${termo}:`, err.message);
    }
  }

  console.log(`\nCarga concluída! ${total} produtos gravados da Amazon no NeonDB.`);
  await pool.end();
}

popularAmazon();
