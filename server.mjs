import express from 'express';
import cors from 'cors';

// 👇 Importando os seus módulos de API (ajuste os nomes das funções se necessário)
import { buscarMercadoLivre } from './api_ml.mjs';
import { buscarAmazon } from './api_amazon.mjs';

const app = express();
app.use(cors()); 
app.use(express.json());

// A rota agora aceita um parâmetro de busca, ex: /api/produtos?busca=notebook
app.get('/api/produtos', async (req, res) => {
    try {
        // Se a barra de pesquisa estiver vazia, buscamos 'tecnologia' por padrão
        const termoBusca = req.query.busca || 'tecnologia';
        console.log(`Buscando em tempo real nas lojas por: ${termoBusca}...`);

        // Executa as duas APIs ao mesmo tempo para o site não ficar lento
        const [produtosML, produtosAmazon] = await Promise.all([
            buscarMercadoLivre(termoBusca),
            buscarAmazon(termoBusca)
        ]);
        
        // Junta os resultados das duas lojas em uma única vitrine
        const todosProdutos = [...produtosML, ...produtosAmazon];

        // Ordena tudo do mais barato para o mais caro
        todosProdutos.sort((a, b) => parseFloat(a.preco) - parseFloat(b.preco));

        console.log(`✅ Sucesso! Enviei ${todosProdutos.length} produtos para o site.`);
        res.json(todosProdutos);
    } catch (erro) {
        console.error("Erro ao buscar nas APIs de terceiros:", erro);
        res.status(500).json({ erro: "Erro interno ao consultar as lojas" });
    }
});

// Usar a porta do Render ou 3000 localmente
const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`🚀 Servidor Mercheap rodando com sucesso! Porta: ${PORTA}`);
});
