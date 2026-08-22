import pkg from 'pg';
const { Pool } = pkg;

// =========================================================
// Credenciais validadas (Atualizadas conforme seu LIA1)
// =========================================================
const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const RAPIDAPI_KEY = "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";
const RAPIDAPI_HOST = "aliexpress-datahub.p.rapidapi.com";
// =========================================================

const pool = new Pool({
    connectionString: CONEXAO_NEON,
    ssl: { rejectUnauthorized: false }
});

async function buscarProdutosAliExpress() {
    console.log("Iniciando busca na API do AliExpress...");
    
    try {
        // URL ajustada de 'iphone' para 'teclado'
        const url = `https://${RAPIDAPI_HOST}/item_search_2?q=teclado&page=1&sort=default`;
        
        const respostaBusca = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': RAPIDAPI_HOST,
                'Content-Type': 'application/json'
            }
        });
        
        const dadosBusca = await respostaBusca.json();
        
        // Caçador flexível para as estruturas comuns do AliExpress
        let listaProdutos = [];
        if (dadosBusca.result && dadosBusca.result.resultList) listaProdutos = dadosBusca.result.resultList;
        else if (dadosBusca.data && dadosBusca.data.items) listaProdutos = dadosBusca.data.items;
        else if (dadosBusca.items) listaProdutos = dadosBusca.items;
        else if (Array.isArray(dadosBusca.result)) listaProdutos = dadosBusca.result;
        else if (Array.isArray(dadosBusca)) listaProdutos = dadosBusca;

        if (!listaProdutos || listaProdutos.length === 0) {
            console.error("A API respondeu, mas a estrutura veio diferente. Veja os dados brutos:", JSON.stringify(dadosBusca).substring(0, 500) + "...");
            return;
        }

        const itensParaSalvar = listaProdutos.slice(0, 3);
        console.log(`Sucesso! Encontramos os produtos no AliExpress. Salvando os 3 primeiros...`);

        for (const item of itensParaSalvar) {
            const idProduto = item.itemId || item.productId || item.id || Math.random().toString();
            const nomeProduto = item.title || item.name || "Produto Sem Nome";
            
            // Limpeza de preço adaptada para dados chineses
            let precoProduto = 0;
            const precoBruto = item.price || item.sellPrice || item.targetSalePrice || item.salePrice || 0;
            if (typeof precoBruto === 'string') {
                precoProduto = parseFloat(precoBruto.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
            } else if (typeof precoBruto === 'object' && precoBruto.amount) {
                precoProduto = precoBruto.amount;
            } else {
                precoProduto = parseFloat(precoBruto) || 0;
            }

            const linkProduto = item.itemUrl || item.productUrl || item.url || "Sem link";
            const imagemProduto = item.image || item.imageUrl || item.thumbnail || "Sem imagem";

            const query = `
                INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url) 
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;
            `;
            // Origem definida para o AliExpress
            const valores = [idProduto, nomeProduto, precoProduto, 'gamer', 'AliExpress', linkProduto, imagemProduto];
            
            const resultado = await pool.query(query, valores);
            console.log(`✅ Salvo: ${nomeProduto.substring(0, 30)}... (ID Banco: ${resultado.rows[0].id})`);
        }

    } catch (erro) {
        console.error("Erro na integração com o AliExpress:", erro);
    } finally {
        await pool.end();
    }
}

buscarProdutosAliExpress();
