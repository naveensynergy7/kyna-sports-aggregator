const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');

const apiId = 27645812; // from my.telegram.org
const apiHash = '8d96dacd290303da9f2542a8d2528aa5';

// After first login, paste your session string here to skip login next time
// Example: const stringSession = new StringSession('1BVtsOK4Bu...');
const stringSession = new StringSession('1BQANOTEuMTA4LjU2LjEzNQG7VymZ9LA5dXsPvKxqyr++RP3vlJL1hdcRWEApWIn+n08+De/0Z8PiKyIK7wOWL+PlG9vXqbGN2Mfgv2jcr7fNWVnkPsoDlkd1T/tbQ13FKFlSm952HUxP5VR3w50Gs3G/rR8Mwy2vw5HfpnZPNX0PsQ/NalL8BT6f7T+6Tx2bzi+VOhKOeOpY47O0KRRKO+/yRBNtp08NCPcn6c5CjHE2UL7S8TQdgMygs7NvfG8ZhMRozw2UPECX22/H4BKwAL+YcJRMoI/5Pes0lOrD2mXYxOyz9/lMGH3njAgiaqOGzsSzC8myfSWkYQKfqMXJsQTFqYeLDSVjFDc4JcrfM/DvdA==');

(async () => {
  const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
  
  await client.start({
    phoneNumber: async () => await input.text('Phone number (with country code): '),
    password: async () => await input.text('2FA password (if enabled): '),
    phoneCode: async () => await input.text('Verification code: '),
    onError: (err) => console.log('Error:', err),
  });
  
  console.log('✅ Connected to Telegram successfully!');
  console.log('🎯 Monitoring group ID: 1566178598...');

  try {
    // First, let's find the correct entity by listing all dialogs
    console.log('🔍 Searching for group/channel with ID 1566178598...');
    const dialogs = await client.getDialogs();
    
    let targetGroup = null;
    for (const dialog of dialogs) {
      const entity = dialog.entity;
      if (entity.id.toString() === '1566178598') {
        targetGroup = entity;
        break;
      }
    }
    
    if (!targetGroup) {
      console.log('❌ Group/Channel with ID 1566178598 not found in your dialogs.');
      console.log('💡 Available groups and channels:');
      
      for (const dialog of dialogs) {
        const entity = dialog.entity;
        if (entity.className === 'Channel' || entity.className === 'Chat') {
          const type = entity.broadcast ? 'Channel' : 'Group';
          console.log(`   ${type}: ${entity.title} (ID: ${entity.id.toString()})`);
        }
      }
      return;
    }
    
    console.log(`📍 Found and monitoring: ${targetGroup.title}`);
    console.log(`📋 Type: ${targetGroup.className}`);
    console.log('⏰ Waiting for messages...\n');

    // Set up event handler for new messages
    client.addEventHandler((update) => {
      if (update.className === 'UpdateNewMessage') {
        const msg = update.message;
        
        // Check if message is from our target group
        const isFromTargetGroup = 
          (msg.peerId.channelId && msg.peerId.channelId.toString() === targetGroup.id.toString()) ||
          (msg.peerId.chatId && msg.peerId.chatId.toString() === targetGroup.id.toString());
          
        if (isFromTargetGroup) {
          const messageText = msg.message || '[Media/File/Sticker]';
          console.log(messageText);
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
})();
