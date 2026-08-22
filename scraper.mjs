import puppeteer from 'puppeteer';
import pkg from 'pg';
const { Pool } = pkg;

// Substitua pela sua string de conexão do Neon
const pool = new Pool({
    connectionString: "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require", 
    ssl: { rejectUnauthorized: false }
});

async function executarScraper() {
    console.log("Iniciando o robô (Estratégia Sniper de Links)...");
    
    const browser = await puppeteer.launch({ headless: false }); 
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');

    try {
        console.log("Acedendo à loja...");
        // Mudamos para uma página de busca padrão da Kabum que é mais fácil de ler
        await page.goto('https://www.kabum.com.br/busca/gamer', { waitUntil: 'domcontentloaded' });
        
        console.log("Rolando a página...");
        await page.evaluate(() => window.scrollBy(0, 1500));

        console.log("Aguardando 8 segundos...");
        await new Promise(resolve => setTimeout(resolve, 8000));

        const produtosExtraidos = await page.evaluate(() => {
            const itens = [];
            // O grande truque: procura qualquer link que tenha "/produto/" na URL
            const links = document.querySelectorAll('a[href*="/produto/"]'); 

            links.forEach((link) => {
                const textoCompleto = link.innerText.trim();
                
                // Pega a primeira linha de texto (que costuma ser o título)
                const nomeProduto = textoCompleto.split('\n')[0]; 
                
                // Filtra para garantir que é um título real (mais de 15 letras) e não um botão vazio
                if (nomeProduto && nomeProduto.length > 15 && !nomeProduto.toLowerCase().includes('comprar')) {
                    itens.push({
                        nome: nomeProduto,
                        categoria: 'gamer',
                        descricao: 'Extraído automaticamente pelo robô',
                        imagem: 'produto-web.png'
                    });
                }
            });
            
            // Limpa os produtos duplicados (pois às vezes a foto e o texto têm o mesmo link)
            const itensUnicos = Array.from(new Set(itens.map(a => a.nome)))
                .map(nome => itens.find(a => a.nome === nome));

            return itensUnicos.slice(0, 5); // Tenta salvar os 5 primeiros
        });

        console.log(`Sucesso! Encontramos ${produtosExtraidos.length} produtos válidos!`);

        for (const item of produtosExtraidos) {
            const query = `
                INSERT INTO public.produtos (nome, categoria, descricao, imagem) 
                VALUES ($1, $2, $3, $4) RETURNING id;
            `;
            const valores = [item.nome, item.categoria, item.descricao, item.imagem];
            const resultado = await pool.query(query, valores);
            console.log(`Salvo: ${item.nome.substring(0, 35)}... (ID: ${resultado.rows[0].id})`);
        }

    } catch (erro) {
        console.error("Erro no robô:", erro);
    } finally {
        await browser.close();
        await pool.end();
        console.log("Robô finalizado.");
    }
}

executarScraper();