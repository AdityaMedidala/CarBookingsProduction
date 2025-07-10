require('dotenv').config();
const express = require('express');
const http = require('http'); // MODIFIED: Use http instead of https
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const { connectDB, initializeDatabase } = require('./config/db');
const bookingRoutes = require('./routes/bookingRoutes');

// --- Basic Setup ---
const app = express();
const PORT = process.env.PORT || 11443;
const HOST = process.env.HOST || '0.0.0.0';

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

// --- START HTTP SERVER ---
async function start() {
    try {
        // --- Database Connection and Initialization ---
        await initializeDatabase();
        await connectDB();

        // --- START: HTTP Changes ---
        // Create the HTTP server with your Express app
        const server = http.createServer(app);
        // --- END: HTTP Changes ---


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
        // MODIFIED: Updated log message for HTTP
        server.listen(PORT, HOST, () => {
            console.log(`🚀 HTTP server with Socket.IO running at http://${HOST}:${PORT}`);
        });

    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

start();