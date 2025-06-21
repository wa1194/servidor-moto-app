# Servidor Moto App

API RESTful para a plataforma "Moto Agora", um serviço de mototáxi sob demanda. Este backend é responsável por gerenciar a autenticação, cadastro e operações de motoristas, clientes e administradores, além de controlar as corridas em tempo real.

## ✨ Funcionalidades Principais

- **Autenticação Unificada:** Um único endpoint `/auth/login` para administradores, motoristas e clientes.
- **Cadastro de Motoristas:** Sistema completo com upload de documentos (CNH, Documento da Moto, Foto de Perfil) para análise.
- **Gerenciamento de Motoristas (Admin):**
    - Listagem de motoristas com status `pendente`, `aprovado` ou `reprovado`.
    - Endpoints para aprovar ou reprovar cadastros.
- **Comunicação em Tempo Real:** Utiliza **Socket.IO** para notificar motoristas sobre novas corridas instantaneamente.
- **Sistema de Corridas:**
    - Clientes podem solicitar corridas.
    - Motoristas online recebem e podem aceitar as solicitações.
- **Serviço de Arquivos:** Endpoint estático para servir as imagens dos documentos dos motoristas.

## 🛠️ Tecnologias Utilizadas

- **Node.js:** Ambiente de execução do JavaScript no servidor.
- **Express.js:** Framework para criação da API RESTful.
- **PostgreSQL:** Banco de dados relacional para persistência dos dados.
- **Socket.IO:** Para comunicação bidirecional e em tempo real.
- **Multer:** Middleware para manuseio de uploads de arquivos (`multipart/form-data`).
- **bcrypt:** Para hashing e segurança de senhas.
- **pg:** Driver do Node.js para conexão com o PostgreSQL.

## 🔒 Segurança

A segurança é um pilar fundamental deste projeto. Lembre-se sempre das seguintes práticas:

-   **Variáveis de Ambiente:** O arquivo `.env` contém informações sensíveis (chaves de banco de dados, senhas) e **NUNCA** deve ser enviado para o repositório Git. O arquivo no repositório é apenas um exemplo.
-   **`.gitignore`**: Certifique-se de que seu arquivo `.gitignore` contém uma linha para ignorar o arquivo `.env`:
    ```
    .env
    ```
-   **Autenticação de Rotas:** Endpoints sensíveis, especialmente as rotas de administrador (`/admin/*`), devem ser protegidos. É preciso implementar uma camada de autenticação (ex: usando tokens JWT) para garantir que apenas usuários autorizados possam acessá-los.

## ⚙️ Configuração do Ambiente

1.  **Clone o repositório:**
    ```bash
    git clone [https://github.com/seu-usuario/servidor-moto-app.git](https://github.com/seu-usuario/servidor-moto-app.git)
    cd servidor-moto-app
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Variáveis de Ambiente:**
    Crie um arquivo `.env` na raiz do projeto. **Não o envie para o Git.** Ele deve conter as seguintes variáveis:
    ```env
    # URL de conexão do seu banco de dados PostgreSQL
    DATABASE_URL="postgresql://user:password@host:port/database"

    # Porta em que o servidor irá rodar
    PORT=3000

    # Credenciais do administrador master
    ADMIN_EMAIL="admin@exemplo.com"
    ADMIN_PASSWORD="admin123"

    # URL base do servidor (usada para gerar os links das imagens)
    BASE_URL="http://localhost:3000"
    ```

4.  **Execute o servidor:**
    ```bash
    npm start
    ```
    O servidor estará rodando em `http://localhost:3000`.

## 🚀 Endpoints da API

Aqui estão os principais endpoints implementados:

- `POST /auth/login`: Autentica um usuário (admin, motorista ou cliente).
- `POST /register/driver`: Realiza o cadastro de um novo motorista, com upload de documentos.
- `GET /admin/drivers`: (Admin) Retorna a lista de todos os motoristas para análise.
- `POST /admin/drivers/:id/approve`: (Admin) Aprova o cadastro de um motorista.
- `POST /admin/drivers/:id/reprove`: (Admin) Reprova o cadastro de um motorista.
- `GET /driver/rides`: (Motorista) Retorna a lista de corridas disponíveis.
- `POST /driver/rides/:rideId/accept`: (Motorista) Aceita uma corrida.
- `POST /client/request-service`: (Cliente) Solicita uma nova corrida.
- `GET /ride/:rideId/status`: (Cliente) Busca o status de uma corrida específica.

## ☁️ Deploy

Este projeto está configurado para deploy na plataforma [Render](https://render.com/).

