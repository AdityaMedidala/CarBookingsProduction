// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const { connectDB } = require('./config/db');
const bookingRoutes = require('./routes/bookingRoutes');

// --- Basic Setup ---
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// --- Database Connection ---
connectDB();

// --- Middleware ---
// Enable CORS for all routes. This is still useful in development.
app.use(cors()); 

// Body parsers for JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Socket.IO Setup ---
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for Socket.IO
        methods: ["GET", "POST"]
    }
});

// Middleware to attach the `io` instance to every request object
// This makes it available in your controllers (e.g., req.io)
app.use((req, res, next) => {
    req.io = io;
    next();
});

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Handler for admin clients to join a specific room
    socket.on('join-admin-room', () => {
        socket.join('admins');
        console.log(`Socket ${socket.id} joined the 'admins' room.`);
    });

    // Handler for live location updates from drivers
    socket.on('update-location', (data) => {
        // Broadcast the location data to all clients in the 'admins' room
        io.to('admins').emit('location-update', data);
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
    });
});


// --- API Routes ---
// All your booking-related API endpoints will be prefixed with /api
app.use('/api/bookings', bookingRoutes);


// --- Serve React Frontend ---
// 1. Point to the 'dist' folder where the production build of your React app is located.
const buildPath = path.join(__dirname, 'dist');
app.use(express.static(buildPath));

// 2. For any GET request that doesn't match an API route or a static file,
//    serve the index.html file. This is crucial for single-page applications (SPAs)
//    that use client-side routing (like React Router).
app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'), (err) => {
        if (err) {
            res.status(500).send(err);
        }
    });
});


// --- Start Server ---
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
