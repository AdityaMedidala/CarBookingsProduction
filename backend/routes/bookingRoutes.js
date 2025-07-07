// routes/bookingRoutes.js

const express = require('express');
const router = express.Router();
const {
    createEmployeeBooking,
    createGuestBooking,
    allocateCar,
    rejectBooking,
    startTrip,
    endTrip,
    forceEndTrip,
    getAllBookings,
    getBookingById,
    getCars,
    addCar,
    updateCarStatus,
    updatePreTripDetails,
    requestCarChange
} = require('../controllers/bookingController');

// --- Requestor Routes (Employee/Guest) ---
router.post('/employee', createEmployeeBooking);
router.post('/guest', createGuestBooking);

// --- Approver & Admin Routes ---
router.put('/approver/allocate/:id', allocateCar);
router.put('/approver/reject/:id', rejectBooking);
router.put('/admin/booking/:id/force-end', forceEndTrip); // More specific route

// --- Driver Trip Routes ---
router.put('/driver/start-trip/:id', startTrip);
router.put('/driver/end-trip/:id', endTrip);
router.put('/driver/request-change/:id', requestCarChange);
router.put('/driver/update-pretrip/:id', updatePreTripDetails);

// --- Car Fleet Routes (Admin) ---
router.post('/cars', addCar);
router.get('/cars', getCars);
router.put('/car/:id/status', updateCarStatus); // More specific route

// --- General Data Routes ---
router.get('/', getAllBookings);
router.get('/:id', getBookingById);

module.exports = router;
