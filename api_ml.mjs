import pkg from 'pg';
const { Pool } = pkg;

const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const RAPIDAPI_KEY = "4396776f14mshbe2416e17f77e89p1b4783jsn79146edc4cf0";
const RAPIDAPI_HOST = "mercado-libre4.p.rapidapi.com";

const pool = new Pool({ connectionString: CONEXAO_NEON, ssl: { rejectUnauthorized: false } });

async function popularML() {
    const categorias = ['notebook', 'mouse', 'monitor', 'placa de video'];
    
    for (const categoria of categorias) {
        console.log(`\nBuscando ${categoria} no Mercado Livre...`);
        try {
            const url = `https://${RAPIDAPI_HOST}/search?country=BR&search=${encodeURIComponent(categoria)}&offset=0&limit=3`;
            const resposta = await fetch(url, { method: 'GET', headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': RAPIDAPI_HOST }});
            const dados = await resposta.json();
            
            let lista = Array.isArray(dados) ? dados : dados.results || [];
            if (!lista.length) continue;

            for (const item of lista) {
                let preco = (typeof item.price === 'object') ? item.price.amount : parseFloat(item.price) || 0;
                
                await pool.query(
                    `INSERT INTO produtos_catalogo (sku_interno, nome, preco, categoria, origem, link_afiliado, imagem_url) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [item.id || Math.random().toString(), item.title || "Sem Nome", preco, categoria, 'Mercado Livre', item.permalink || "", item.thumbnail || ""]
                );
                console.log(`✅ Salvo: ${item.title?.substring(0, 30)}...`);
            }
        } catch (erro) { console.error(`Erro ao buscar ${categoria}:`, erro); }
    }
    await pool.end();
}
popularML();
