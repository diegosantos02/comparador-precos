import express from 'express';
import cors from 'cors';
import pkg from 'pg';
const { Pool } = pkg;

const app = express();
app.use(cors()); 
app.use(express.json());

const CONEXAO_NEON = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb";

const pool = new Pool({
    connectionString: CONEXAO_NEON,
    ssl: { rejectUnauthorized: false }
});

// Listar produtos
app.get('/api/produtos', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM produtos_catalogo ORDER BY preco ASC');
        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao buscar produtos:", erro);
        res.status(500).json({ erro: "Erro ao buscar produtos" });
    }
});

// Cadastro
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
        res.status(500).json({ erro: "Erro no cadastro" });
    }
});

// Login
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
        res.status(500).json({ erro: "Erro no login" });
    }
});

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => console.log(`Rodando na porta ${PORTA}`));
