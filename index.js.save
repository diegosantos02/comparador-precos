const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Conexão com o banco de dados na nuvem (Neon) - CHAVE ATUALIZADA
const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

// 2. Rota de Busca de Produtos e Ofertas
app.get('/api/produtos', async (req, res) => {
    try {
        const { busca } = req.query;
        let query = `
            SELECT p.nome AS produto, p.categoria, f.nome AS loja, o.preco, o.frete, o.url_compra
            FROM produtos p
            JOIN ofertas o ON p.id = o.produto_id
            JOIN fornecedores f ON f.id = o.fornecedor_id
        `;
        let values = [];

        if (busca) {
            query += ` WHERE p.nome ILIKE $1`;
            values.push(`%${busca}%`);
        }
        query += ` ORDER BY o.preco ASC`;

        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ erro: 'Erro interno no servidor' });
    }
});

// 3. Rota de Login de Usuários
app.post('/api/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        
        const result = await pool.query(
            'SELECT id, nome, email, foto_perfil FROM usuarios WHERE email = $1 AND senha = $2', 
            [email, senha]
        );
        
        if (result.rows.length > 0) {
            res.json({ sucesso: true, mensagem: 'Bem-vindo de volta!', usuario: result.rows[0] });
        } else {
            res.status(401).json({ sucesso: false, mensagem: 'E-mail ou senha incorretos' });
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ erro: 'Erro interno no servidor' });
    }
});

// 4. Inicia o servidor localmente
app.listen(3000, () => {
    console.log('🚀 Servidor do Comparador rodando na porta 3000!');
});

// 5. Exportação necessária para o Vercel (Nuvem)
module.exports = app;
