// controllers/bookingController.js

const Booking = require('../models/bookingModel');
const { sendAllocationRequestEmail, sendAllocationEmail, sendRejectionEmail, sendTripCompletionEmail } = require('../services/emailService');

const createBookingShared = async (req, res, bookingType) => {
    try {
        const bookingId = await Booking.create(req.body, bookingType);
        const approverEmail = process.env.APPROVER_EMAIL || 'approver@example.com';
        await sendAllocationRequestEmail(req.body, approverEmail, bookingId);
        res.status(201).json({ message: `${bookingType} booking created, awaiting allocation.`, bookingId });
    } catch (error) {
        console.error(`Error creating ${bookingType.toLowerCase()} booking:`, error);
        res.status(500).json({ message: `Server error while creating ${bookingType.toLowerCase()} booking.` });
    }
}

const createEmployeeBooking = (req, res) => createBookingShared(req, res, 'Employee');
const createGuestBooking = (req, res) => createBookingShared(req, res, 'Guest');

const allocateCar = async (req, res) => {
    const { id } = req.params;
    const allocationData = req.body;

    try {
        const updatedBooking = await Booking.allocate(id, allocationData);

        if (!updatedBooking) {
            return res.status(404).json({ message: 'Booking not found or already actioned.' });
        }

        try {
            const recipientEmail = updatedBooking.employeeEmail || updatedBooking.guestEmail;
            const driverEmail = process.env.DRIVER_EMAIL || 'driver@example.com';

            if (recipientEmail) {
                await sendAllocationEmail(updatedBooking, recipientEmail, driverEmail);
            }
            
            res.status(200).json({
                message: 'Car allocated successfully and notifications sent.',
                booking: updatedBooking
            });

        } catch (emailError) {
            console.error(`Email sending failed for booking ${id} after successful allocation:`, emailError.message);
            res.status(200).json({
                message: 'Car allocated successfully, but failed to send email notifications. Please notify the user manually.',
                booking: updatedBooking
            });
        }

    } catch (error) {
        console.error('Error during car allocation database operation:', error.message);
        res.status(500).json({ message: `Server error while allocating car: ${error.message}` });
    }
};

const rejectBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminComments } = req.body;
        const updatedBooking = await Booking.reject(id, adminComments);

        if (!updatedBooking) {
            return res.status(404).json({ message: 'Booking not found or not pending allocation.' });
        }
        
        const recipientEmail = updatedBooking.employeeEmail || updatedBooking.guestEmail;
        if (recipientEmail) {
            await sendRejectionEmail(updatedBooking, recipientEmail, adminComments);
        }

        res.status(200).json({ message: 'Booking rejected successfully', booking: updatedBooking });
    } catch (error) {
        console.error('Error rejecting booking:', error);
        res.status(500).json({ message: 'Server error while rejecting booking.' });
    }
};

const startTrip = async (req, res) => {
    try {
        const { id } = req.params;
        const { startPoint, startTime, startKms } = req.body;

        if (!startPoint || !startTime || !startKms) {
            return res.status(400).json({ message: 'Missing required fields: startPoint, startTime, and startKms are required.' });
        }

        const updatedBooking = await Booking.startTrip(id, req.body);
        if (!updatedBooking) return res.status(404).json({ message: 'Booking not found or not ready for trip start.' });
        res.status(200).json({ message: 'Trip started successfully', booking: updatedBooking });
    } catch (error) {
        console.error('Error starting trip:', error);
        res.status(500).json({ message: `Database error starting trip: ${error.message}` });
    }
};

// *** START: MODIFIED FUNCTION ***
// This function now emits the final drop point and car name along with the booking ID.
const endTrip = async (req, res) => {
    try {
        const { id } = req.params;
        let { endTime, endKms, carId, dropPoint } = req.body;

        if (!endTime || !endKms || !carId || !dropPoint) {
            return res.status(400).json({
                message: 'Missing required fields: endTime, endKms, carId, and dropPoint are required.'
            });
        }
        
        const postTripData = {
            endTime: new Date(`1970-01-01T${endTime}`),
            endKms: parseInt(endKms),
            carId: parseInt(carId),
            dropPoint: dropPoint
        };

        const updatedBooking = await Booking.endTrip(id, postTripData);
        if (!updatedBooking) {
            return res.status(404).json({ message: 'Booking not found or trip not started.' });
        }

        // Notify admin clients to remove the live marker and add a 'completed' marker.
        req.io.to('admins').emit('location-update-complete', { 
            bookingId: parseInt(id),
            dropPoint: updatedBooking.dropPoint, // Send the final location
            carName: updatedBooking.startCarAllotted // Send the car name
        });

       const recipientEmail = updatedBooking.employeeEmail || updatedBooking.guestEmail;
        if (recipientEmail) {
            await sendTripCompletionEmail(updatedBooking, recipientEmail);
        }

        res.status(200).json({ message: 'Trip ended successfully and car is now available.', booking: updatedBooking });
    } catch (error) {
        console.error('Error ending trip:', error);
        res.status(500).json({ message: `Server error while ending trip: ${error.message}` });
    }
};
// *** END: MODIFIED FUNCTION ***


const requestCarChange = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        if (!reason) {
            return res.status(400).json({ message: 'A reason for the change request is required.' });
        }
        const updatedBooking = await Booking.requestChange(id, reason);
        if (!updatedBooking) {
            return res.status(404).json({ message: 'Booking not found or not in a state to be changed.' });
        }
        // Optionally, send an email to the admin/approver here
        res.status(200).json({ message: 'Car change request submitted.', booking: updatedBooking });
    } catch (error) {
        console.error('Error requesting car change:', error);
        res.status(500).json({ message: `Database error requesting car change: ${error.message}` });
    }
};

const forceEndTrip = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminComments } = req.body;
        const updatedBooking = await Booking.forceEndTrip(id, adminComments);
        if (!updatedBooking) {
            return res.status(404).json({ message: 'Booking not found or could not be ended.' });
        }
        res.status(200).json({ message: 'Trip has been force-ended by admin.', booking: updatedBooking });
    } catch (error) {
        console.error('Error force-ending trip:', error);
        res.status(500).json({ message: `Server error while force-ending trip: ${error.message}` });
    }
};


const getCars = async (req, res) => {
    try {
        const showAll = req.query.showAll === 'true';
        const cars = await Booking.getCars(showAll);
        res.status(200).json(cars);
    } catch (error) {
        console.error('Error fetching cars:', error);
        res.status(500).json({ message: 'Server error while fetching cars.' });
    }
};

const getAllBookings = async (req, res) => {
    try {
        const bookings = await Booking.findAll();
        res.status(200).json(bookings);
    } catch (error) {
        console.error('Error fetching all bookings:', error);
        res.status(500).json({ message: 'Server error while fetching bookings.' });
    }
};


const addCar = async (req, res) => {
    try {
        const carData = req.body;
        const newCar = await Booking.addCar(carData);
        res.status(201).json({ message: 'Car added successfully', car: newCar });
    } catch (error) {
        console.error('Error adding car:', error);
        res.status(500).json({ message: 'Server error while adding car.' });
    }
};

const updateCarStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // Expecting 'Free' or 'Maintenance'
        const success = await Booking.updateCarStatus(id, status);
        if (success) {
            res.status(200).json({ message: `Car status updated to ${status}` });
        } else {
            res.status(404).json({ message: 'Car not found or could not be updated.' });
        }
    } catch (error) {
        console.error('Error updating car status:', error);
        res.status(500).json({ message: 'Server error while updating car status.' });
    }
};

const getBookingById = async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await Booking.findById(id);
        if (booking) {
            res.status(200).json(booking);
        } else {
            res.status(404).json({ message: 'Booking not found' });
        }
    } catch (error) {
        console.error(`Error fetching booking ${req.params.id}:`, error);
        res.status(500).json({ message: 'Server error while fetching booking.' });
    }
};

const updatePreTripDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { guestName, numGuests } = req.body;
        const updatedBooking = await Booking.updateGuestInfo(id, guestName, numGuests);

        if (!updatedBooking) {
            return res.status(404).json({ message: 'Booking not found.' });
        }
        res.status(200).json({ message: 'Guest details updated successfully', booking: updatedBooking });
    } catch (error) {
        console.error('Error updating pre-trip details:', error);
        res.status(500).json({ message: 'Server error while updating details.' });
    }
};


module.exports = {
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
};