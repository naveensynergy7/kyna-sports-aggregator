const bcrypt = require('bcryptjs');

// Generate hash for password "admin123"
const password = 'admin123';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
        console.error('Error generating hash:', err);
        return;
    }
    
    console.log('Password: admin123');
    console.log('Hash:', hash);
    console.log('\nCopy this hash to your database schema file.');
});
