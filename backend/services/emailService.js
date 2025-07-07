// services/emailService.js

const { ConfidentialClientApplication } = require('@azure/msal-node');
const axios = require('axios');
const emailConfig = require('../config/email');

const msalClient = new ConfidentialClientApplication({
    auth: {
        clientId: emailConfig.clientId,
        authority: `https://login.microsoftonline.com/${emailConfig.tenantId}`,
        clientSecret: emailConfig.clientSecret,
    },
});

const getGraphToken = async () => {
    try {
        const tokenRequest = { scopes: emailConfig.scopes };
        const response = await msalClient.acquireTokenByClientCredential(tokenRequest);
        return response.accessToken;
    } catch (error) {
        console.error('Error acquiring Graph API token:', error.message);
        throw new Error('Could not acquire Graph API token.');
    }
};


const sendEmail = async (message) => {
    try {
        const accessToken = await getGraphToken();
        const endpoint = `https://graph.microsoft.com/v1.0/users/${emailConfig.userId}/sendMail`;

        await axios.post(endpoint, { message, saveToSentItems: 'true' }, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });
        console.log('Email sent successfully.');
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data, null, 2) : error.message;
        console.error('Error sending email via Graph API:', errorMessage);
        throw new Error('Failed to send email.');
    }
};

const sendAllocationRequestEmail = async (bookingData, approverEmail, bookingId) => {
    const { employeeName, guestName, fromLocation, toLocation, startDate, startTime } = bookingData;
    const requesterName = employeeName || guestName;

    const subject = `Vehicle Allocation Required: New Booking (ID: ${bookingId})`;
    const body = `
        <p>Hello Approver,</p>
        <p>A new car booking request has been submitted and requires vehicle allocation in the portal.</p>
        <h3>Booking Details:</h3>
        <ul>
            <li><strong>Booking ID:</strong> ${bookingId}</li>
            <li><strong>Requester:</strong> ${requesterName}</li>
            <li><strong>Journey:</strong> ${fromLocation} to ${toLocation}</li>
            <li><strong>Date:</strong> ${startDate} at ${startTime}</li>
        </ul>
        <p>Thank you,</p>
        <p>Car Booking System</p>
    `;

    await sendEmail({
        subject: subject,
        body: { contentType: 'HTML', content: body },
        toRecipients: [{ emailAddress: { address: approverEmail } }],
    });
};

const sendAllocationEmail = async (bookingDetails, recipientEmail, driverEmail) => {
    const { id, startCarAllotted, startCarNumber, fromLocation, toLocation, startDate, startTime } = bookingDetails;
    const subject = `Your Car Booking is Confirmed (ID: ${id})`;
    const body = `
        <p>Hello,</p>
        <p>Your car booking request has been confirmed and a vehicle has been allocated. Please find the details below.</p>
        <h3>Trip Details:</h3>
        <ul>
            <li><strong>Booking ID:</strong> ${id}</li>
            <li><strong>Pickup:</strong> ${fromLocation}</li>
            <li><strong>Drop-off:</strong> ${toLocation}</li>
            <li><strong>Date & Time:</strong> ${startDate} at ${startTime}</li>
        </ul>
        <h3>Vehicle Details:</h3>
        <ul>
            <li><strong>Vehicle:</strong> ${startCarAllotted}</li>
            <li><strong>Vehicle Number:</strong> ${startCarNumber}</li>
        </ul>
        <p>Your driver will be in touch. Have a safe trip!</p>
        <p>Thank you,</p>
        <p>Car Booking System</p>
    `;

    await sendEmail({
        subject: subject,
        body: { contentType: 'HTML', content: body },
        toRecipients: [{ emailAddress: { address: recipientEmail } }],
        ccRecipients: [{ emailAddress: { address: driverEmail } }]
    });
};

// New function to send rejection emails
const sendRejectionEmail = async (bookingDetails, recipientEmail, comments) => {
    const { id, fromLocation, toLocation, startDate, startTime } = bookingDetails;
    const subject = `Update on Your Car Booking (ID: ${id})`;
    const body = `
        <p>Hello,</p>
        <p>We regret to inform you that your car booking request with the details below has been rejected.</p>
        <h3>Booking Details:</h3>
        <ul>
            <li><strong>Booking ID:</strong> ${id}</li>
            <li><strong>Journey:</strong> ${fromLocation} to ${toLocation}</li>
            <li><strong>Date & Time:</strong> ${startDate} at ${startTime}</li>
        </ul>
        <h3>Reason for Rejection:</h3>
        <p>${comments || 'No specific reason was provided.'}</p>
        <p>Please contact the administration for further clarification if needed.</p>
        <p>Thank you,</p>
        <p>Car Booking System</p>
    `;

    await sendEmail({
        subject: subject,
        body: { contentType: 'HTML', content: body },
        toRecipients: [{ emailAddress: { address: recipientEmail } }],
    });
};

// New function to send trip completion emails
const sendTripCompletionEmail = async (bookingData, recipientEmail) => {
    const { id, guestName, employeeName, fromLocation, toLocation, startCarAllotted, driverEndKms } = bookingData;
    const requesterName = guestName || employeeName;
    const subject = `Trip Completed: Booking ID #${id}`;
    const body = `
        <p>Hello ${requesterName},</p>
        <p>Your trip from <strong>${fromLocation}</strong> to <strong>${toLocation}</strong> is complete.</p>
        <p><strong>Car:</strong> ${startCarAllotted}</p>
        <p><strong>Final KMs:</strong> ${driverEndKms}</p>
        <p>Thank you for using our service.</p>
    `;

    const message = {
        subject: subject,
        toRecipients: [{ emailAddress: { address: recipientEmail } }],
        body: { contentType: 'HTML', content: body },
    };

    await sendEmail(message);
};

module.exports = {
    sendAllocationRequestEmail,
    sendAllocationEmail,
    sendRejectionEmail,
    sendTripCompletionEmail // Export new function
};