// config/email.js

// Configuration for Microsoft Graph API
const emailConfig = {
    // Your Azure AD tenant ID
    tenantId: process.env.TENANT_ID,
    
    // Your Azure AD app's client ID
    clientId: process.env.CLIENT_ID,
    
    // Corrected line to access the environment variable
    clientSecret: process.env.CLIENT_SECRET, //
    
    // The user ID or principal name of the mailbox to send from
    // This could be a shared mailbox or a specific user account
    userId: process.env.SENDER_EMAIL,
    
    // Scopes required for sending email
    scopes: ['https://graph.microsoft.com/.default']
};

module.exports = emailConfig;