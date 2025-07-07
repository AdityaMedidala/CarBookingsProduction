// models/bookingModel.js
const { sql } = require('../config/db');

const Booking = {
    create: async (bookingData, bookingType) => {
        try {
            const endDate = bookingData.tripType === 'One Way' ? null : bookingData.endDate;
            const endTime = bookingData.tripType === 'One Way' ? null : bookingData.endTime;

            const result = await sql.query`
                INSERT INTO Car_Bookings (
                    bookingType, employeeName, employeeId, guestName, guestEmail, contactNumber, companyName,
                    numGuests, journeyType, fromLocation, toLocation, startDate, startTime,
                    endDate, endTime, tripType, reasonForTravel, status, isAdminTrip
                ) VALUES (
                    ${bookingType}, ${bookingData.employeeName || null}, ${bookingData.employeeId || null},
                    ${bookingData.guestName || null}, ${bookingData.guestEmail || null}, ${bookingData.contactNumber || null}, ${bookingData.companyName || null},
                    ${bookingData.numGuests || null}, ${bookingData.journeyType}, ${bookingData.fromLocation},
                    ${bookingData.toLocation}, ${bookingData.startDate}, ${bookingData.startTime},
                    ${endDate}, ${endTime}, ${bookingData.tripType}, ${bookingData.reasonForTravel},
                    'Pending Allocation', ${bookingData.isAdminTrip || 0}
                ); SELECT SCOPE_IDENTITY() AS id;
            `;
            return result.recordset[0].id;
        } catch (err) {
            throw new Error(`Database error creating booking: ${err.message}`);
        }
    },

    reject: async (id, comments) => {
        try {
            const result = await sql.query`
                UPDATE Car_Bookings
                SET
                    status = 'Rejected',
                    adminComments = ${comments},
                    updatedAt = GETDATE()
                WHERE id = ${id} AND status = 'Pending Allocation';

                SELECT * FROM Car_Bookings WHERE id = ${id};
            `;
            return result.recordset[0];
        } catch (err)
        {
            throw new Error(`Database error rejecting booking: ${err.message}`);
        }
    },

    allocate: async (id, allocationData) => {
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();

            const bookingResult = await transaction.request()
                .input('id', sql.Int, id)
                .input('startCarAllotted', sql.NVarChar, allocationData.startCarAllotted)
                .input('startCarNumber', sql.NVarChar, allocationData.startCarNumber)
                .input('carId', sql.Int, allocationData.carId)
                .input('carType', sql.NVarChar, allocationData.carType)
                .query(`
                    UPDATE Car_Bookings
                    SET
                        status = 'Car Allocated',
                        startCarAllotted = @startCarAllotted,
                        startCarNumber = @startCarNumber,
                        carId = @carId,
                        carType = @carType,
                        driverComments = NULL, -- Clear previous driver comments on new allocation
                        updatedAt = GETDATE()
                    WHERE id = @id AND (status = 'Pending Allocation' OR status = 'Change Requested');

                    SELECT * FROM Car_Bookings WHERE id = @id;
                `);

            if (bookingResult.rowsAffected[0] === 0) {
                throw new Error('Booking not found or has already been actioned.');
            }

            const carResult = await transaction.request()
                .input('carId', sql.Int, allocationData.carId)
                .query(`
                    UPDATE Cars
                    SET
                        isAvailable = 0,
                        status = 'In-Trip',
                        updatedAt = GETDATE()
                    WHERE id = @carId AND isAvailable = 1 AND status = 'Free';
                `);
            
            if (carResult.rowsAffected[0] === 0) {
                throw new Error('The selected car is no longer available. Please refresh and choose another car.');
            }

            await transaction.commit();
            return bookingResult.recordset[0];

        } catch (err) {
            await transaction.rollback();
            console.error(`Database error during allocation for booking ${id}:`, err.message);
            throw new Error(`Database error allocating car: ${err.message}`);
        }
    },

    // *** START: MODIFIED FUNCTION ***
    // This function now saves the driver's starting point to the database.
    // NOTE: This assumes you have a column named 'startPoint' (e.g., NVARCHAR(255)) in your 'Car_Bookings' table.
    startTrip: async (id, preTripData) => {
        try {
            const result = await sql.query`
                UPDATE Car_Bookings
                SET
                    status = 'Trip Started',
                    driverStartTime = ${preTripData.startTime},
                    driverStartKms = ${preTripData.startKms},
                    startPoint = ${preTripData.startPoint},
                    updatedAt = GETDATE()
                WHERE id = ${id} AND status = 'Car Allocated';

                SELECT * FROM Car_Bookings WHERE id = ${id};
            `;
            return result.recordset[0];
        } catch (err) {
            throw new Error(`Database error starting trip: ${err.message}`);
        }
    },
    // *** END: MODIFIED FUNCTION ***

    endTrip: async (id, postTripData) => {
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();

            const updatedBookingResult = await transaction.request()
                .input('id', sql.Int, id)
                .input('endTime', sql.Time, postTripData.endTime)
                .input('endKms', sql.Int, postTripData.endKms)
                .input('dropPoint', sql.NVarChar, postTripData.dropPoint)
                .query`
                    UPDATE Car_Bookings
                    SET
                        status = 'Trip Completed',
                        driverEndTime = @endTime,
                        driverEndKms = @endKms,
                        dropPoint = @dropPoint,
                        updatedAt = GETDATE()
                    WHERE id = @id AND status = 'Trip Started';
                    
                    SELECT * FROM Car_Bookings WHERE id = @id;
                `;

            if (updatedBookingResult.rowsAffected[0] === 0) {
                throw new Error('Booking not found or not in "Trip Started" status.');
            }

            if (postTripData.carId) {
                await transaction.request()
                    .input('endKms', sql.Int, postTripData.endKms)
                    .input('carId', sql.Int, postTripData.carId)
                    .query`
                        UPDATE Cars
                        SET
                            currentKms = @endKms,
                            isAvailable = 1,
                            status = 'Free',
                            updatedAt = GETDATE()
                        WHERE id = @carId;
                    `;
            }
            
            await transaction.commit();
            return updatedBookingResult.recordset[0];
        } catch (err) {
            await transaction.rollback();
            console.error(`Database error ending trip for booking ${id}:`, err.message);
            throw new Error(`Database error ending trip: ${err.message}`);
        }
    },
    
    requestChange: async (id, reason) => {
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();

            const bookingCheck = await transaction.request().input('id', sql.Int, id).query('SELECT carId FROM Car_Bookings WHERE id = @id AND status = \'Car Allocated\'');
            if (bookingCheck.recordset.length === 0) {
                throw new Error('Booking is not in a state where a car change can be requested.');
            }
            const { carId } = bookingCheck.recordset[0];

            if (carId) {
                await transaction.request()
                    .input('carId', sql.Int, carId)
                    .query`
                        UPDATE Cars
                        SET
                            isAvailable = 1,
                            status = 'Free',
                            updatedAt = GETDATE()
                        WHERE id = @carId;
                    `;
            }

            const result = await transaction.request()
                .input('id', sql.Int, id)
                .input('reason', sql.NVarChar, reason)
                .query`
                    UPDATE Car_Bookings
                    SET
                        status = 'Change Requested',
                        driverComments = @reason,
                        updatedAt = GETDATE()
                    WHERE id = @id AND status = 'Car Allocated';

                    SELECT * FROM Car_Bookings WHERE id = @id;
                `;
            
            if (result.rowsAffected[0] === 0) {
                 throw new Error('Could not update booking status for change request.');
            }

            await transaction.commit();
            return result.recordset[0];
        } catch (err) {
            await transaction.rollback();
            throw new Error(`Database error requesting car change: ${err.message}`);
        }
    },
    
    forceEndTrip: async (id, adminComments) => {
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            
            const bookingCheck = await transaction.request().input('id', sql.Int, id).query('SELECT carId FROM Car_Bookings WHERE id = @id');
            if (bookingCheck.recordset.length === 0) {
                throw new Error('Booking not found.');
            }
            const { carId } = bookingCheck.recordset[0];

            const updatedBookingResult = await transaction.request()
                .input('id', sql.Int, id)
                .input('adminComments', sql.NVarChar, adminComments)
                .query`
                    UPDATE Car_Bookings
                    SET
                        status = 'Trip Completed',
                        adminComments = CONCAT(ISNULL(adminComments, ''), ' Force-ended by admin: ', @adminComments),
                        updatedAt = GETDATE()
                    WHERE id = @id AND status IN ('Trip Started', 'Car Allocated');
                    
                    SELECT * FROM Car_Bookings WHERE id = @id;
                `;

            if (updatedBookingResult.rowsAffected[0] === 0) {
                throw new Error('Booking not in a state that can be force-ended.');
            }

            if (carId) {
                await transaction.request()
                    .input('carId', sql.Int, carId)
                    .query`
                        UPDATE Cars
                        SET
                            isAvailable = 1,
                            status = 'Free',
                            updatedAt = GETDATE()
                        WHERE id = @carId;
                    `;
            }
            
            await transaction.commit();
            return updatedBookingResult.recordset[0];
        } catch (err) {
            await transaction.rollback();
            throw new Error(`Database error force-ending trip: ${err.message}`);
        }
    },

    findAll: async () => {
        try {
            const result = await sql.query`SELECT * FROM Car_Bookings ORDER BY createdAt DESC`;
            return result.recordset;
        } catch (err) {
            throw new Error(`Database error fetching all bookings: ${err.message}`);
        }
    },

    findById: async (id) => {
        try {
            const result = await sql.query`SELECT * FROM Car_Bookings WHERE id = ${id}`;
            return result.recordset[0];
        } catch (err) {
            throw new Error(`Database error fetching booking by ID: ${err.message}`);
        }
    },

    getCars: async (showAll = false) => {
        try {
            let query = `SELECT id, carName, carNumber, currentKms, carType, isAvailable, status FROM Cars ORDER BY carName`;
            if (!showAll) {
                 query = `SELECT id, carName, carNumber, currentKms, carType, isAvailable, status FROM Cars WHERE isAvailable = 1 AND status = 'Free' ORDER BY carName`;
            }
            const result = await sql.query(query);
            return result.recordset;
        } catch (err) {
            throw new Error(`Database error fetching cars: ${err.message}`);
        }
    },

    addCar: async (carData) => {
        try {
            const result = await sql.query`
                INSERT INTO Cars (carName, carNumber, currentKms, carType, isAvailable, status, createdAt, updatedAt)
                VALUES (
                    ${carData.carName},
                    ${carData.carNumber},
                    ${carData.currentKms || 0},
                    ${carData.carType || 'Sedan'},
                    1, 
                    'Free',
                    GETDATE(),
                    GETDATE()
                );
                SELECT SCOPE_IDENTITY() AS id;
            `;
            return { id: result.recordset[0].id, ...carData };
        } catch (err) {
            throw new Error(`Database error adding car: ${err.message}`);
        }
    },

    updateCarStatus: async (id, newStatus) => {
        try {
            let isAvailable = 1;
            if (newStatus === 'Maintenance') {
                isAvailable = 0;
            }
            const result = await sql.query`
                UPDATE Cars
                SET isAvailable = ${isAvailable}, status = ${newStatus}, updatedAt = GETDATE()
                WHERE id = ${id};
            `;
            return result.rowsAffected[0] > 0;
        } catch (err) {
            throw new Error(`Database error updating car status: ${err.message}`);
        }
    },

    updateGuestInfo: async (id, guestName, numGuests) => {
        try {
            const result = await sql.query`
                UPDATE Car_Bookings
                SET
                    guestName = ${guestName},
                    numGuests = ${numGuests},
                    updatedAt = GETDATE()
                WHERE id = ${id};

                SELECT * FROM Car_Bookings WHERE id = ${id};
            `;
            return result.recordset[0];
        } catch (err) {
            throw new Error(`Database error updating guest info: ${err.message}`);
        }
    }
};

module.exports = Booking;
