import express from 'express';
import cors from 'cors';
import pkg from 'pg';
const { Pool } = pkg;

const app = express();
app.use(cors()); 
app.use(express.json());

// 👇 URL limpa! Removemos o '?sslmode=require...' que estava travando o Node
const CONEXAO_NEON_LIMPA = "postgresql://neondb_owner:npg_pCst8BP9Vrmy@ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb";

const pool = new Pool({
    connectionString: CONEXAO_NEON_LIMPA,
    ssl: { rejectUnauthorized: false }
});

app.get('/api/produtos', async (req, res) => {
    try {
        console.log("Recebi um pedido de produtos! Buscando no NeonDB...");
        const query = 'SELECT * FROM produtos_catalogo ORDER BY preco ASC';
        const resultado = await pool.query(query);
        
        console.log(`✅ Sucesso! Enviei ${resultado.rows.length} teclados para o site.`);
        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao buscar no banco de dados:", erro);
        res.status(500).json({ erro: "Erro interno no servidor" });
    }
});

const PORTA = 3000;
app.listen(PORTA, () => {
    console.log(`🚀 Servidor rodando com sucesso! Porta: ${PORTA}`);
});
