import pkg from 'pg';
const { Pool } = pkg;

const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const RAPIDAPI_KEY = "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";
const RAPIDAPI_HOST = "mercado-libre4.p.rapidapi.com";

const pool = new Pool({ 
  connectionString: CONEXAO_NEON, 
  ssl: { rejectUnauthorized: false } 
});

async function popularML() {
  const categorias = ['notebook gamer', 'monitor gamer', 'placa de video rtx', 'mouse gamer'];
  let totalInseridos = 0;

  for (const termo of categorias) {
    console.log(`\nBuscando "${termo}" no Mercado Livre via RapidAPI...`);
    try {
      const url = `https://${RAPIDAPI_HOST}/search?country=BR&search=${encodeURIComponent(termo)}&offset=0&limit=20`;
      const resposta = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST
        }
      });

      const dados = await resposta.json();
      const lista = Array.isArray(dados) ? dados : (dados.results || []);

      if (!lista.length) {
        console.log(`Nenhum retorno para "${termo}".`);
        continue;
      }

      for (const item of lista) {
        const nome = item.title;
        const preco = (typeof item.price === 'object') ? (parseFloat(item.price.amount) || 0) : (parseFloat(item.price) || 0);
        const linkReal = item.permalink;
        
        let imagemReal = '';
        if (item.thumbnail) {
          imagemReal = item.thumbnail.replace('http://', 'https://').replace('-I.jpg', '-O.jpg');
        } else if (item.image) {
          imagemReal = item.image.replace('http://', 'https://');
        }

        if (nome && preco > 0 && linkReal && imagemReal) {
          // Inserção direta sem especificar coluna em ON CONFLICT
          await pool.query(
            `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING`,
            [item.id || Math.random().toString(), nome, preco, termo, 'Mercado Livre', linkReal, imagemReal]
          );
          totalInseridos++;
          console.log(`Salvo: ${nome.substring(0, 35)}... | R$ ${preco}`);
        }
      }
    } catch (err) {
      console.error(`Erro ao processar ${termo}:`, err.message);
    }
  }

  console.log(`\nConcluído! ${totalInseridos} produtos gravados com sucesso.`);
  await pool.end();
}

popularML();
