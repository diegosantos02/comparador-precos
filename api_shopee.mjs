import pkg from 'pg';
const { Pool } = pkg;

// =========================================================
// Credenciais validadas (Atualizadas conforme seu LIA1)
// =========================================================
const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const RAPIDAPI_KEY = "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";
const RAPIDAPI_HOST = "shopee-product-scraper2.p.rapidapi.com";
// =========================================================

const pool = new Pool({
    connectionString: CONEXAO_NEON,
    ssl: { rejectUnauthorized: false }
});

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function buscarProdutosShopee() {
    console.log("Iniciando busca na API da Shopee...");
    
    try {
        const urlBusca = `https://${RAPIDAPI_HOST}/shopee?country=BR&priceSlicing=false&maxItems=30&keywords=teclado`;
        
        let respostaBusca = await fetch(urlBusca, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': RAPIDAPI_HOST,
                'Content-Type': 'application/json'
            }
        });
        
        let dadosBusca = await respostaBusca.json();
        
        // Se a API retornar um jobId, fazemos o polling correto
        if (dadosBusca.jobId && !dadosBusca.results) {
            let jobId = dadosBusca.jobId;
            console.log(`Tarefa iniciada (Job ID: ${jobId}). Aguardando processamento da Shopee...`);
            
            let statusRodando = true;
            let tentativas = 0;
            
            while (statusRodando && tentativas < 10) {
                tentativas++;
                await esperar(5000); // Espera 5 segundos
                
                console.log(`Consultando status da tarefa (Tentativa ${tentativas}/10)...`);
                const urlJob = `https://${RAPIDAPI_HOST}/jobs/${jobId}`;
                
                const respostaJob = await fetch(urlJob, {
                    method: 'GET',
                    headers: {
                        'X-RapidAPI-Key': RAPIDAPI_KEY,
                        'X-RapidAPI-Host': RAPIDAPI_HOST,
                        'Content-Type': 'application/json'
                    }
                });
                
                const dadosJob = await respostaJob.json();
                
                if (dadosJob.results && Array.isArray(dadosJob.results) && dadosJob.results.length > 0) {
                    dadosBusca = dadosJob;
                    statusRodando = false;
                } else if (dadosJob.status === 'error') {
                    console.error("A tarefa falhou nos servidores da Shopee.");
                    return;
                }
            }
        }
        
        let listaProdutos = [];
        if (dadosBusca.results && Array.isArray(dadosBusca.results)) listaProdutos = dadosBusca.results;
        else if (dadosBusca.data && Array.isArray(dadosBusca.data)) listaProdutos = dadosBusca.data;
        else if (dadosBusca.items && Array.isArray(dadosBusca.items)) listaProdutos = dadosBusca.items;
        else if (Array.isArray(dadosBusca)) listaProdutos = dadosBusca;

        if (!listaProdutos || listaProdutos.length === 0) {
            console.error("A API concluiu, mas nenhum produto foi retornado nos resultados. Veja os dados:", JSON.stringify(dadosBusca, null, 2));
            return;
        }

        const itensParaSalvar = listaProdutos.slice(0, 3);
        console.log(`Sucesso! Encontramos produtos na Shopee. Salvando os 3 primeiros...`);

        for (const item of itensParaSalvar) {
            const idProduto = String(item.itemId || item.id || Math.random());
            const nomeProduto = item.name || "Produto Sem Nome";
            
            let precoProduto = 0;
            const precoBruto = item.price || 0;
            if (typeof precoBruto === 'string') {
                precoProduto = parseFloat(precoBruto.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
            } else {
                precoProduto = parseFloat(precoBruto) || 0;
            }

            const linkProduto = item.url || "Sem link";
            const imagemProduto = (item.images && item.images.length > 0) ? item.images[0] : "Sem imagem";

            const query = `
                INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url) 
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;
            `;
            const valores = [idProduto, nomeProduto, precoProduto, 'gamer', 'Shopee', linkProduto, imagemProduto];
            
            const resultado = await pool.query(query, valores);
            console.log(`✅ Salvo: ${nomeProduto.substring(0, 30)}... (ID Banco: ${resultado.rows[0].id})`);
        }

    } catch (erro) {
        console.error("Erro na integração com a Shopee:", erro);
    } finally {
        await pool.end();
    }
}

buscarProdutosShopee();
