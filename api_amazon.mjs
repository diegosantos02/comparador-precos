import pkg from 'pg';
const { Pool } = pkg;

// =========================================================
// Credenciais validadas (Atualizadas conforme seu LIA1)
// =========================================================
const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const RAPIDAPI_KEY = "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";
const RAPIDAPI_HOST = "real-time-amazon-data-the-most-complete.p.rapidapi.com";
// =========================================================

const pool = new Pool({
    connectionString: CONEXAO_NEON,
    ssl: { rejectUnauthorized: false }
});

async function buscarProdutosAmazon() {
    console.log("Iniciando busca na API da Amazon...");
    
    try {
        // 👇 URL corrigida para 'marketplace=com.br'
        const url = `https://${RAPIDAPI_HOST}/search?query=teclado&marketplace=com.br&language=pt&page=1&sort=relevanceblender`;
        
        const respostaBusca = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': RAPIDAPI_HOST,
                'Content-Type': 'application/json'
            }
        });
        
        const dadosBusca = await respostaBusca.json();
        
        let listaProdutos = [];
        if (dadosBusca.data && Array.isArray(dadosBusca.data.products)) listaProdutos = dadosBusca.data.products;
        else if (dadosBusca.data && Array.isArray(dadosBusca.data)) listaProdutos = dadosBusca.data;
        else if (Array.isArray(dadosBusca.results)) listaProdutos = dadosBusca.results;
        else if (Array.isArray(dadosBusca.items)) listaProdutos = dadosBusca.items;
        else if (Array.isArray(dadosBusca)) listaProdutos = dadosBusca;

        if (!listaProdutos || listaProdutos.length === 0) {
            console.error("A API respondeu, mas a estrutura veio diferente. Veja os dados brutos:", JSON.stringify(dadosBusca, null, 2));
            return;
        }

        const itensParaSalvar = listaProdutos.slice(0, 3);
        console.log(`Sucesso! Encontramos os produtos na Amazon. Salvando os 3 primeiros...`);

        for (const item of itensParaSalvar) {
            const idProduto = item.asin || item.id || item.item_id || Math.random().toString();
            const nomeProduto = item.product_title || item.title || item.name || "Produto Sem Nome";
            
            let precoProduto = 0;
            const precoBruto = item.product_price || item.price || 0;
            if (typeof precoBruto === 'string') {
                precoProduto = parseFloat(precoBruto.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
            } else if (typeof precoBruto === 'object' && precoBruto.amount) {
                precoProduto = precoBruto.amount;
            } else {
                precoProduto = parseFloat(precoBruto) || 0;
            }

            const linkProduto = item.product_url || item.url || item.link || "Sem link";
            const imagemProduto = item.product_photo || item.thumbnail || item.image || item.image_url || "Sem imagem";

            const query = `
                INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url) 
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;
            `;
            const valores = [idProduto, nomeProduto, precoProduto, 'gamer', 'Amazon', linkProduto, imagemProduto];
            
            const resultado = await pool.query(query, valores);
            console.log(`✅ Salvo: ${nomeProduto.substring(0, 30)}... (ID Banco: ${resultado.rows[0].id})`);
        }

    } catch (erro) {
        console.error("Erro na integração com a Amazon:", erro);
    } finally {
        await pool.end();
    }
}

buscarProdutosAmazon();
