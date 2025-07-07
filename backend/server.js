require('dotenv').config();
const express = require('express');
const https = require('https'); // Use https module
const fs = require('fs');       // Use File System module to read certs
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const { connectDB } = require('./config/db');
const bookingRoutes = require('./routes/bookingRoutes');

// --- Basic Setup ---
const app = express();
const PORT = process.env.PORT || 11443; // Using a port from your reference
const HOST = process.env.HOST || '0.0.0.0';   // Using host from your reference

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- API Routes ---
app.use('/api/bookings', bookingRoutes);

// --- Serve React Frontend ---
const buildPath = path.join(__dirname, 'dist');
app.use(express.static(buildPath));
app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'), (err) => {
        if (err) {
            res.status(500).send(err);
        }
    });
});

// --- START HTTPS SERVER ---
async function start() {
    try {
        // --- Database Connection ---
        await connectDB();
        console.log('MS SQL Database Connected...');

        // --- HTTPS & Socket.IO Setup ---
        const httpsOptions = {
            key:  fs.readFileSync(path.join(__dirname, 'certs', 'mydomain.key')),
            cert: fs.readFileSync(path.join(__dirname, 'certs', 'certificate.crt')),
            // ca:   fs.readFileSync(path.join(__dirname, 'certs', 'ca_bundle.crt')), // Optional: include if you have a CA bundle
        };

        const server = https.createServer(httpsOptions, app);
        
        const io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Middleware to make `io` accessible in controllers
        app.use((req, res, next) => {
            req.io = io;
            next();
        });

        // --- Socket.IO Connection Handling ---
        io.on('connection', (socket) => {
            console.log(`Socket connected: ${socket.id}`);

            socket.on('join-admin-room', () => {
                socket.join('admins');
                console.log(`Socket ${socket.id} joined the 'admins' room.`);
            });

            socket.on('update-location', (data) => {
                io.to('admins').emit('location-update', data);
            });

            socket.on('disconnect', () => {
                console.log(`Socket disconnected: ${socket.id}`);
            });
        });

        // --- Listen for connections ---
        server.listen(PORT, HOST, () => {
            console.log(`🚀 HTTPS server with Socket.IO running at https://${HOST}:${PORT}`);
        });

    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

start();