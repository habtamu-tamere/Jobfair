require('dotenv').config();
const express = require('express');
const axios = require('axios');
const schedule = require('node-schedule');
const app = express();
app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL;
const PORT = process.env.PORT || 3000;

// In-memory store (replace with database in production)
const jobsDB = [];

// Format Amharic date
function formatAmharicDate(date) {
    const months = ["ጃንዩወሪ", "ፌብሩወሪ", "ማርች", "ኤፕሪል", "ሜይ", "ጁን", 
                   "ጁላይ", "ኦገስት", "ሴፕቴምበር", "ኦክቶበር", "ኖቬምበር", "ዲሴምበር"];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Create Telegram post
async function postToTelegram(jobData) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + jobData.expiryDays);
    
    const employer = jobData.employerType === 'company' 
        ? `🏢 ${jobData.companyName}`
        : `👤 ${jobData.individualName}`;

    const experience = jobData.experience === (jobData.language === 'en' ? 'Yes' : 'አዎ')
        ? jobData.yearsExp
        : (jobData.language === 'en' ? 'Not required' : 'አያስፈልግም');

    let message;
    if (jobData.language === 'am') {
        message = `
${employer} የሚፈልጋል:

🏢 *${jobData.title}*  
📍 *ቦታ:* ${jobData.location}  
💼 *ልምድ:* ${experience}  
👥 *ጾታ:* ${jobData.gender}  
📞 *እውቂያ:* ${jobData.contact}  
⏳ *የሚያበቃበት ቀን:* ${formatAmharicDate(expiryDate)}  

#ስራ #${jobData.location.replace(/\s+/g, '')}
        `;
    } else {
        message = `
${employer} is hiring:

🏢 *${jobData.title}*  
📍 *Location:* ${jobData.location}  
💼 *Experience:* ${experience}  
👥 *Gender:* ${jobData.gender}  
📞 *Contact:* ${jobData.contact}  
⏳ *Expires:* ${expiryDate.toLocaleDateString()}  

#Job #${jobData.location.replace(/\s+/g, '')}
        `;
    }

    try {
        const response = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: TELEGRAM_CHANNEL,
                text: message,
                parse_mode: 'Markdown'
            }
        );
        
        // Store job with expiry information
        const jobEntry = {
            ...jobData,
            telegramMessageId: response.data.result.message_id,
            expiresAt: expiryDate,
            postedAt: new Date()
        };
        jobsDB.push(jobEntry);
        
        // Schedule auto-deletion
        schedule.scheduleJob(expiryDate, async () => {
            await deleteFromTelegram(jobEntry.telegramMessageId);
            console.log(`Job expired and deleted: ${jobEntry.title}`);
        });
        
        return { success: true, messageId: response.data.result.message_id };
    } catch (error) {
        console.error('Telegram API error:', error.response?.data || error.message);
        return { success: false, error: error.message };
    }
}

// Delete expired job
async function deleteFromTelegram(messageId) {
    try {
        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`,
            {
                chat_id: TELEGRAM_CHANNEL,
                message_id: messageId
            }
        );
        return true;
    } catch (error) {
        console.error('Failed to delete Telegram message:', error.message);
        return false;
    }
}

// API Endpoint
app.post('/post-job', async (req, res) => {
    // In production, verify payment here before posting
    
    const result = await postToTelegram(req.body);
    
    if (result.success) {
        res.status(200).json({ 
            success: true,
            messageId: result.messageId
        });
    } else {
        res.status(500).json({ 
            success: false,
            error: result.error
        });
    }
});

// Job management endpoint
app.get('/jobs', (req, res) => {
    res.json({
        count: jobsDB.length,
        jobs: jobsDB
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
