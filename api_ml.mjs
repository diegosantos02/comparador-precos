import pkg from 'pg';
const { Pool } = pkg;

// =========================================================
// Credenciais validadas (Atualizadas conforme seu LIA1)
// =========================================================
const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const RAPIDAPI_KEY = "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";
const RAPIDAPI_HOST = "mercado-libre4.p.rapidapi.com";
// =========================================================

const pool = new Pool({
    connectionString: CONEXAO_NEON,
    ssl: { rejectUnauthorized: false }
});

async function buscarProdutos() {
    console.log("Iniciando busca final na API mercado-libre4 (Brasil)...");
    
    try {
        const url = `https://${RAPIDAPI_HOST}/search?country=BR&search=teclado&offset=0&limit=3`;
        
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
        if (Array.isArray(dadosBusca)) listaProdutos = dadosBusca;
        else if (dadosBusca.results) listaProdutos = dadosBusca.results;
        else if (dadosBusca.data) listaProdutos = dadosBusca.data;
        else if (dadosBusca.items) listaProdutos = dadosBusca.items;

        if (!listaProdutos || listaProdutos.length === 0) {
            console.error("A API respondeu, mas não encontramos a lista. Estrutura:", dadosBusca);
            return;
        }

        console.log(`Sucesso! Encontramos ${listaProdutos.length} produtos. Formatando os preços e salvando...`);

        for (const item of listaProdutos) {
            const idProduto = item.id || item.item_id || Math.random().toString();
            const nomeProduto = item.title || item.name || "Produto Sem Nome";
            
            // 👇 A MÁGICA AQUI: Lógica para extrair apenas o número puro do preço
            let precoProduto = 0;
            if (item.price) {
                if (typeof item.price === 'object' && item.price.amount !== undefined) {
                    precoProduto = item.price.amount; // Pega só o '199.99' do pacote
                } else if (typeof item.price === 'number' || typeof item.price === 'string') {
                    precoProduto = parseFloat(item.price) || 0;
                }
            }

            const linkProduto = item.permalink || item.url || item.link || "Sem link";
            const imagemProduto = item.thumbnail || item.picture || item.image_url || "Sem imagem";

            const query = `
                INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url) 
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;
            `;
            const valores = [idProduto, nomeProduto, precoProduto, 'gamer', 'Mercado Livre', linkProduto, imagemProduto];
            
            const resultado = await pool.query(query, valores);
            console.log(`✅ Salvo: ${nomeProduto.substring(0, 30)}... (ID Banco: ${resultado.rows[0].id})`);
        }

    } catch (erro) {
        console.error("Erro na integração:", erro);
    } finally {
        await pool.end();
    }
}

buscarProdutos();
