import pkg from 'pg';
const { Pool } = pkg;

const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const RAPIDAPI_KEY = "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";
const RAPIDAPI_HOST = "real-time-amazon-data-the-most-complete.p.rapidapi.com";

const pool = new Pool({ connectionString: CONEXAO_NEON, ssl: { rejectUnauthorized: false } });

async function popularAmazon() {
    const categorias = ['notebook', 'mouse', 'monitor', 'placa de video'];
    
    for (const categoria of categorias) {
        console.log(`\nBuscando ${categoria} na Amazon...`);
        try {
            const url = `https://${RAPIDAPI_HOST}/search?query=${encodeURIComponent(categoria)}&marketplace=com.br&language=pt&page=1&sort=relevanceblender`;
            const resposta = await fetch(url, { method: 'GET', headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': RAPIDAPI_HOST }});
            const dadosBusca = await resposta.json();
            
            let listaProdutos = [];
            if (dadosBusca.data && Array.isArray(dadosBusca.data.products)) listaProdutos = dadosBusca.data.products;
            else if (dadosBusca.data && Array.isArray(dadosBusca.data)) listaProdutos = dadosBusca.data;
            else if (Array.isArray(dadosBusca.results)) listaProdutos = dadosBusca.results;
            else if (Array.isArray(dadosBusca.items)) listaProdutos = dadosBusca.items;
            else if (Array.isArray(dadosBusca)) listaProdutos = dadosBusca;

            if (!listaProdutos.length) continue;

            for (const item of listaProdutos.slice(0, 3)) {
                // 👇 Suas validações originais restauradas
                const nomeProduto = item.product_title || item.title || item.name || "Produto Sem Nome";
                const idProduto = item.asin || item.id || item.item_id || Math.random().toString();
                const linkProduto = item.product_url || item.url || item.link || "Sem link";
                const imagemProduto = item.product_photo || item.thumbnail || item.image || item.image_url || "Sem imagem";
                
                let precoProduto = 0;
                const precoBruto = item.product_price || item.price || 0;
                if (typeof precoBruto === 'string') {
                    precoProduto = parseFloat(precoBruto.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
                } else if (typeof precoBruto === 'object' && precoBruto.amount) {
                    precoProduto = precoBruto.amount;
                } else {
                    precoProduto = parseFloat(precoBruto) || 0;
                }
                
                await pool.query(
                    `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [idProduto, nomeProduto, precoProduto, categoria, 'Amazon', linkProduto, imagemProduto]
                );
                console.log(`✅ Salvo: ${nomeProduto.substring(0, 30)}...`);
            }
        } catch (erro) { console.error(`Erro ao buscar ${categoria}:`, erro); }
    }
    await pool.end();
}
popularAmazon();
