// config/db.js

const sql = require('mssql');

// MS SQL configuration
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_NAME,
    options: {
        trustServerCertificate: true,
        encrypt: false,
        connectionTimeout: 60000,
    },
};

const masterDbConfig = { ...dbConfig, database: 'master' };
const appDbName = process.env.DB_NAME || 'CarBookingDB';

const TBL_CARS = `
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Cars]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Cars] (
        [id] INT PRIMARY KEY IDENTITY(1,1),
        [carName] NVARCHAR(255) NOT NULL,
        [carNumber] NVARCHAR(50) NOT NULL UNIQUE,
        [currentKms] INT NOT NULL DEFAULT 0,
        [carType] NVARCHAR(50),
        [isAvailable] BIT NOT NULL DEFAULT 1,
        [status] NVARCHAR(50) NOT NULL DEFAULT 'Free' CHECK (status IN ('Free', 'In-Trip', 'Maintenance')),
        [createdAt] DATETIME2 DEFAULT GETDATE(),
        [updatedAt] DATETIME2 DEFAULT GETDATE()
    );
    PRINT 'Table "Cars" created.';
END
`;

const TBL_CAR_BOOKINGS = `
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Car_Bookings]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Car_Bookings] (
        [id] INT PRIMARY KEY IDENTITY(1,1),
        [bookingType] NVARCHAR(50),
        [employeeName] NVARCHAR(255),
        [employeeId] NVARCHAR(100),
        [guestName] NVARCHAR(255),
        [guestEmail] NVARCHAR(255),
        [contactNumber] NVARCHAR(50),
        [companyName] NVARCHAR(255),
        [numGuests] INT,
        [journeyType] NVARCHAR(50),
        [fromLocation] NVARCHAR(MAX),
        [toLocation] NVARCHAR(MAX),
        [startDate] DATE,
        [startTime] TIME,
        [endDate] DATE,
        [endTime] TIME,
        [tripType] NVARCHAR(50),
        [reasonForTravel] NVARCHAR(MAX),
        [status] NVARCHAR(100) DEFAULT 'Pending Allocation',
        [isAdminTrip] BIT DEFAULT 0,
        [createdAt] DATETIME2 DEFAULT GETDATE(),
        [updatedAt] DATETIME2 DEFAULT GETDATE(),
        [adminComments] NVARCHAR(MAX),
        [driverComments] NVARCHAR(MAX),
        [startCarAllotted] NVARCHAR(255),
        [startCarNumber] NVARCHAR(50),
        [carId] INT,
        [carType] NVARCHAR(50),
        [driverStartTime] TIME,
        [driverStartKms] INT,
        [startPoint] NVARCHAR(255),
        [driverEndTime] TIME,
        [driverEndKms] INT,
        [dropPoint] NVARCHAR(255),
        FOREIGN KEY (carId) REFERENCES Cars(id)
    );
    PRINT 'Table "Car_Bookings" created.';
END
`;

// Function to establish a database connection
const connectDB = async () => {
    try {
        await sql.connect(dbConfig);
        console.log(`MS SQL Database Connected to "${appDbName}"...`);
    } catch (err) {
        // This specific error code means the database doesn't exist.
        if (err.code === 'ELOGIN') {
             console.warn(`Database "${appDbName}" not found. The initialization process will attempt to create it.`);
        } else {
            console.error('Database Connection Failed:', err.message);
            process.exit(1);
        }
    }
};

const initializeDatabase = async () => {
    let pool;
    try {
        // 1. Connect to the 'master' database to check for and create our application DB
        console.log("Connecting to 'master' DB to initialize...");
        pool = await sql.connect(masterDbConfig);
        
        const dbCheckResult = await pool.request().query(`SELECT name FROM sys.databases WHERE name = N'${appDbName}'`);
        
        if (dbCheckResult.recordset.length === 0) {
            console.log(`Database "${appDbName}" does not exist. Creating it now...`);
            await pool.request().query(`CREATE DATABASE [${appDbName}]`);
            console.log(`Database "${appDbName}" created successfully.`);
        } else {
            console.log(`Database "${appDbName}" already exists.`);
        }
        await pool.close();

        // 2. Now, connect to our application DB to create the tables
        await sql.connect(dbConfig); // Reconnect to the specific app DB
        console.log(`Connected to "${appDbName}" to set up tables...`);

        // 3. Create 'Cars' table if it doesn't exist
        console.log("Checking for 'Cars' table...");
        await sql.query(TBL_CARS);

        // 4. Create 'Car_Bookings' table if it doesn't exist
        console.log("Checking for 'Car_Bookings' table...");
        await sql.query(TBL_CAR_BOOKINGS);

        console.log('Database schema is up to date.');

    } catch (err) {
        console.error('FATAL: Database initialization failed:', err.message);
        if (pool) await pool.close();
        process.exit(1);
    }
};


module.exports = { sql, connectDB, initializeDatabase };