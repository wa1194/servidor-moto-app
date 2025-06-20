// --- DEPENDÊNCIAS ---
const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt'); // Biblioteca para segurança de senhas
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
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));


// --- DADOS TEMPORÁRIOS ---
const admins = [{ 
    id: "admin01", 
    email: process.env.ADMIN_EMAIL || "admin@exemplo.com", 
    password: process.env.ADMIN_PASSWORD || "admin123", 
    role: "master" 
}];


// --- Configuração do Multer ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '..', 'uploads');
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
//                      ROTAS DA APLICAÇÃO
// ==================================================================

// --- ROTAS DO CLIENTE ---

// ROTA ATUALIZADA PARA USAR O BANCO DE DADOS
app.post('/register/client', async (req, res) => {
  const { name, email, password, cpf, phoneNumber, city } = req.body;

  // 1. Validação de entrada
  if (!name || !email || !password || !cpf || !phoneNumber || !city) {
    return res.status(400).json({ message: "Todos os campos são obrigatórios." });
  }

  const client = await pool.connect();
  try {
    // 2. Segurança: Hashear a senha antes de salvar no banco
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Inserir o novo cliente no banco de dados
    const result = await client.query(
      'INSERT INTO clients (name, email, password, cpf, phoneNumber, city) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, email, hashedPassword, cpf, phoneNumber, city]
    );

    const newClient = result.rows[0];
    console.log("Novo cliente cadastrado no BANCO DE DADOS:", newClient);
    
    // Remove a senha do objeto antes de enviar de volta para o app
    delete newClient.password;

    res.status(201).json({ message: "Cadastro realizado com sucesso!", user: newClient });

  } catch (error) {
    console.error('Erro ao cadastrar cliente:', error);
    // Verifica se o erro é de violação de chave única (email ou cpf duplicado)
    if (error.code === '23505') { // Código de erro do PostgreSQL para unique_violation
      return res.status(409).json({ message: "Email ou CPF já cadastrado." });
    }
    res.status(500).json({ message: "Erro interno do servidor." });
  } finally {
    client.release(); // Sempre libera o cliente de volta para o pool
  }
});


// --- ROTAS AINDA EM CONSTRUÇÃO ---

app.post('/auth/login', (req, res) => {
    return res.status(501).json({ message: "Rota em construção." });
});

app.post('/register/driver', upload.fields([
    { name: 'cnhPhoto', maxCount: 1 }, { name: 'motoDoc', maxCount: 1 }, { name: 'profilePhoto', maxCount: 1 }
]), (req, res) => {
    return res.status(501).json({ message: "Rota em construção." });
});

app.get('/driver/rides', (req, res) => {
    return res.status(501).json({ message: "Rota em construção." });
});

app.post('/client/request-service', (req, res) => {
    return res.status(501).json({ message: "Rota em construção." });
});

app.get('/ride/:rideId/status', (req, res) => {
    return res.status(501).json({ message: "Rota em construção." });
});

// ... (Restante das rotas em construção)


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
    createTables();
});