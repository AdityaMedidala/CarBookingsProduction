// config/db.js

const sql = require('mssql');

// MS SQL configuration
const dbConfig = {
    user: process.env.DB_USER || 'your_db_user',
    password: process.env.DB_PASSWORD || 'your_db_password',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'master',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true', // Use true for Azure SQL Database, false for local
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' // Change to true for local dev / self-signed certs
    }
};

// Function to establish a database connection
const connectDB = async () => {
    try {
        await sql.connect(dbConfig);
        console.log('MS SQL Database Connected...');
    } catch (err) {
        console.error('Database Connection Failed:', err.message);
        // Exit process with failure
        process.exit(1);
    }
};

module.exports = { sql, connectDB };
