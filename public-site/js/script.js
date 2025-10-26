// Featured Games JavaScript

// Format date to readable format
function formatDate(dateString) {
    const date = new Date(dateString);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[date.getDay()];
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${dayName}, ${day}/${month}/${year}`;
}

// Format time to 12-hour format
function formatTime(timeString) {
    if (!timeString) return 'Time TBD';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

// Create game card HTML
function createGameCard(match) {
    const hasTag = match.requirement || match.game_type;
    
    return `
        <div class="game-card">
            ${hasTag ? `
            <div class="card-tag competitive">
                <span>${match.requirement ? "Looking for: " + match.requirement.toUpperCase() : ''}</span>
                <span class="tag-right">${match.game_type ? match.game_type.toUpperCase() : ''}</span>
            </div>
            ` : ''}
            <div class="card-content">
                <div class="card-header">
                    <h2 class="game-title">${match.original_message}</h2>
                    <span class="game-price">${match.entry || '$0'}</span>
                </div>
                <div class="game-details-alt">
                    <div class="detail-row-group">
                        <div class="detail-row">
                            <span class="icon">📅</span>
                            <span>${match.date ? formatDate(match.date) : 'Date TBD'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="icon">⏰</span>
                            <span>${formatTime(match.time)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="icon">📍</span>
                            <span>${match.location || 'Location TBD'}</span>
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="btn-details" onclick="toggleDetails(this)">Details</button>
                        <a href="${match.contact_url || '#'}" target="_blank" class="btn-contact">Contact</a>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Toggle details functionality
function toggleDetails(button) {
    const card = button.closest('.game-card');
    card.classList.toggle('expanded');
    // You can add more details expansion logic here
}

// Load and display matches
async function loadMatches() {
    try {
        const response = await fetch('football_matches.json');
        const data = await response.json();
        const matches = data[0].matches || [];
        
        const container = document.getElementById('games-container');
        container.innerHTML = matches.map(match => createGameCard(match)).join('');
        
        // Add animation on scroll
        observeCards();
    } catch (error) {
        console.error('Error loading matches:', error);
        document.getElementById('games-container').innerHTML = '<p style="text-align: center; padding: 20px;">Unable to load matches. Please try again later.</p>';
    }
}

// Add animation on scroll
function observeCards() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.game-card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        observer.observe(card);
    });
}

// Load matches when page loads
document.addEventListener('DOMContentLoaded', loadMatches);

