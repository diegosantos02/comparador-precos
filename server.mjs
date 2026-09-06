import express from 'express';
import cors from 'cors';
import pkg from 'pg';
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

// Conexão direta com o NeonDB
const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const pool = new Pool({
    connectionString: CONEXAO_NEON,
    ssl: { rejectUnauthorized: false }
});

// 1. Rota principal da vitrine: consome a View que une Produtos, Links e Último Preço do Histórico
app.get('/api/produtos', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM view_produtos_catalogo ORDER BY preco ASC');
        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao buscar produtos da view:", erro);
        res.status(500).json({ erro: "Erro ao buscar catálogo unificado" });
    }
});

// 2. Rota de Histórico de Preços para alimentar gráficos
app.get('/api/historico/:produtoId', async (req, res) => {
    const { produtoId } = req.params;
    try {
        const query = `
            SELECT 
                p.nome,
                pl.loja,
                hp.preco,
                hp.coletado_em
            FROM historico_precos hp
            JOIN produtos_links pl ON hp.produto_link_id = pl.id
            JOIN produtos p ON pl.produto_id = p.id
            WHERE p.id = $1
            ORDER BY hp.coletado_em ASC
        `;
        const resultado = await pool.query(query, [produtoId]);
        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao buscar histórico:", erro);
        res.status(500).json({ erro: "Erro ao carregar histórico de preços" });
    }
});

// 3. Cadastro de usuário
app.post('/api/cadastrar', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const existe = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (existe.rows.length > 0) {
            return res.status(400).json({ erro: "E-mail já cadastrado!" });
        }
        const novo = await pool.query('INSERT INTO usuarios (email, senha) VALUES ($1, $2) RETURNING *', [email, senha]);
        res.json({ sucesso: true, usuarioId: novo.rows[0].id, email: novo.rows[0].email });
    } catch (erro) {
        console.error("Erro no cadastro:", erro);
        res.status(500).json({ erro: "Erro no cadastro" });
    }
});

// 4. Login de usuário
app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const resultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({ erro: "Conta não encontrada!" });
        }
        const usuario = resultado.rows[0];
        if (usuario.senha !== senha) {
            return res.status(401).json({ erro: "Senha incorreta!" });
        }
        res.json({ sucesso: true, usuarioId: usuario.id, email: usuario.email });
    } catch (erro) {
        console.error("Erro no login:", erro);
        res.status(500).json({ erro: "Erro no login" });
    }
});

// 5. Adicionar à Lista de Desejos
app.post('/api/desejos', async (req, res) => {
    const { usuarioId, produtoId } = req.body;
    try {
        const produtoIdStr = String(produtoId);
        const duplicado = await pool.query(
            'SELECT * FROM lista_desejos WHERE usuario_id = $1 AND produto_id = $2', 
            [usuarioId, produtoIdStr]
        );
        if (duplicado.rows.length > 0) {
            return res.json({ sucesso: true, mensagem: "Produto já está na lista!" });
        }
        
        await pool.query(
            'INSERT INTO lista_desejos (usuario_id, produto_id) VALUES ($1, $2)', 
            [usuarioId, produtoIdStr]
        );
        res.json({ sucesso: true });
    } catch (erro) {
        console.error("Erro ao salvar desejo:", erro);
        res.status(500).json({ erro: "Erro ao salvar favorito" });
    }
});

// 6. Buscar Lista de Desejos
app.get('/api/desejos/:usuarioId', async (req, res) => {
    const { usuarioId } = req.params;
    try {
        const query = `
            SELECT DISTINCT v.* FROM view_produtos_catalogo v
            JOIN lista_desejos d ON v.id::text = d.produto_id
            WHERE d.usuario_id = $1
        `;
        const resultado = await pool.query(query, [usuarioId]);
        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao carregar desejos:", erro);
        res.status(500).json({ erro: "Erro ao carregar desejos" });
    }
});

// 7. Remover da Lista de Desejos
app.delete('/api/desejos/:usuarioId/:produtoId', async (req, res) => {
    const { usuarioId, produtoId } = req.params;
    try {
        const produtoIdStr = String(produtoId);
        await pool.query(
            'DELETE FROM lista_desejos WHERE usuario_id = $1 AND produto_id = $2', 
            [usuarioId, produtoIdStr]
        );
        res.json({ sucesso: true });
    } catch (erro) {
        console.error("Erro ao remover desejo:", erro);
        res.status(500).json({ erro: "Erro ao remover favorito" });
    }
});

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`🚀 Servidor Mercheap rodando na porta: ${PORTA}`);
});
