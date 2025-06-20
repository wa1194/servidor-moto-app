// --- DEPENDÊNCIAS ---
const express = require('express');
const { Pool } = require('pg'); // Driver para o PostgreSQL
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// --- CONFIGURAÇÃO DO APP ---
const app = express();
const port = process.env.PORT || 3000;

// --- CONEXÃO COM O BANCO DE DADOS POSTGRESQL ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// --- MIDDLEWARES ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Caminho corrigido para a pasta de uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));


// --- DADOS TEMPORÁRIOS (SERÃO MOVIDOS PARA O BANCO) ---
const admins = [{ 
    id: "admin01", 
    email: process.env.ADMIN_EMAIL || "admin@exemplo.com", 
    password: process.env.ADMIN_PASSWORD || "admin123", 
    role: "master" 
}];


// --- Configuração do Multer (mantida por enquanto) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '..', 'uploads'); // Caminho corrigido
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


// ==================================================================
//    ATENÇÃO: AS ROTAS ABAIXO ESTÃO QUEBRADAS TEMPORARIAMENTE
//    Elas serão reescritas uma a uma para usar o banco de dados.
// ==================================================================

// --- ROTA DE LOGIN UNIFICADA ---
app.post('/auth/login', (req, res) => {
    // Lógica a ser reescrita com SQL
    return res.status(501).json({ message: "Rota em construção." });
});

// --- ROTAS DO MOTORISTA ---
app.post('/register/driver', upload.fields([
    { name: 'cnhPhoto', maxCount: 1 },
    { name: 'motoDoc', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 }
]), (req, res) => {
    // Lógica a ser reescrita com SQL
    return res.status(501).json({ message: "Rota em construção." });
});

app.get('/driver/rides', (req, res) => {
    // Lógica a ser reescrita com SQL
    return res.status(501).json({ message: "Rota em construção." });
});

// --- ROTAS DO CLIENTE ---
app.post('/register/client', (req, res) => {
    // Lógica a ser reescrita com SQL
    return res.status(501).json({ message: "Rota em construção." });
});

app.post('/client/request-service', (req, res) => {
    // Lógica a ser reescrita com SQL
    return res.status(501).json({ message: "Rota em construção." });
});

app.get('/ride/:rideId/status', (req, res) => {
    // Lógica a ser reescrita com SQL
    return res.status(501).json({ message: "Rota em construção." });
});

// ... (O restante das rotas também precisará ser reescrito)


// --- FUNÇÃO PARA CRIAR TABELAS (SE NÃO EXISTIREM) ---
const createTables = async () => {
  const client = await pool.connect();
  try {
    // Tabela de Usuários (Motoristas)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        cpf VARCHAR(14) UNIQUE NOT NULL,
        cidade VARCHAR(100),
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phoneNumber VARCHAR(20),
        profilePhotoUrl VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pendente',
        cnhPhotoUrl VARCHAR(255),
        motoDocUrl VARCHAR(255)
      );
    `);

    // Tabela de Clientes
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        cpf VARCHAR(14) UNIQUE NOT NULL,
        city VARCHAR(100),
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phoneNumber VARCHAR(20)
      );
    `);

     // Tabela de Corridas
    await client.query(`
      CREATE TABLE IF NOT EXISTS rides (
        id SERIAL PRIMARY KEY,
        client_id INT REFERENCES clients(id),
        driver_id INT REFERENCES users(id) NULL,
        start_location VARCHAR(255) NOT NULL,
        end_location VARCHAR(255) NOT NULL,
        payment_method VARCHAR(50),
        request_type VARCHAR(50),
        value NUMERIC(10, 2),
        status VARCHAR(20) DEFAULT 'PENDING',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('Tabelas verificadas/criadas com sucesso.');
  } catch (err) {
    console.error('Erro ao criar as tabelas:', err);
  } finally {
    client.release();
  }
};


// --- INICIALIZAÇÃO DO SERVIDOR ---
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
    // Chama a função para verificar/criar as tabelas ao iniciar
    createTables();
});