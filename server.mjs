import express from 'express';
import cors from 'cors';
import pkg from 'pg';
const { Pool } = pkg;

const app = express();
app.use(cors()); 
app.use(express.json());

const CONEXAO_NEON_LIMPA = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb";

const pool = new Pool({
    connectionString: CONEXAO_NEON_LIMPA,
    ssl: { rejectUnauthorized: false }
});

// 1. Rota para Listar Produtos
app.get('/api/produtos', async (req, res) => {
    try {
        const query = 'SELECT * FROM produtos_catalogo ORDER BY preco ASC';
        const resultado = await pool.query(query);
        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao buscar produtos:", erro);
        res.status(500).json({ erro: "Erro interno no servidor" });
    }
});

// 2. Rota para Cadastro / Login de Usuário
app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        // Verifica se o usuário já existe
        let resultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        
        let usuario;
        if (resultado.rows.length > 0) {
            usuario = resultado.rows[0];
            if (usuario.senha !== senha) {
                return res.status(401).json({ erro: "Senha incorreta!" });
            }
        } else {
            // Se não existe, cria a conta automaticamente para facilitar o fluxo de uso
            const novo = await pool.query('INSERT INTO usuarios (email, senha) VALUES ($1, $2) RETURNING *', [email, senha]);
            usuario = novo.rows[0];
        }
        
        res.json({ sucesso: true, usuarioId: usuario.id, email: usuario.email });
    } catch (erro) {
        console.error("Erro no login:", erro);
        res.status(500).json({ erro: "Erro ao processar login" });
    }
});

// 3. Rota para Adicionar à Lista de Desejos
app.post('/api/desejos', async (req, res) => {
    const { usuarioId, produtoId } = req.body;
    try {
        await pool.query('INSERT INTO lista_desejos (usuario_id, produto_id) VALUES ($1, $2)', [usuarioId, produtoId]);
        res.json({ sucesso: true, mensagem: "Produto salvo na lista de desejos!" });
    } catch (erro) {
        console.error("Erro ao salvar desejo:", erro);
        res.status(500).json({ erro: "Erro ao salvar favorito" });
    }
});

// 4. Rota para Buscar a Lista de Desejos do Usuário
app.get('/api/desejos/:usuarioId', async (req, res) => {
    const { usuarioId } = req.params;
    try {
        const query = `
            SELECT p.* FROM produtos_catalogo p
            JOIN lista_desejos d ON p.id = d.produto_id
            WHERE d.usuario_id = $1
        `;
        const resultado = await pool.query(query, [usuarioId]);
        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao buscar desejos:", erro);
        res.status(500).json({ erro: "Erro ao carregar lista de desejos" });
    }
});

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`🚀 Servidor Mercheap rodando na porta: ${PORTA}`);
});
