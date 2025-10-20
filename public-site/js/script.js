// Featured Games JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Contact button functionality
    const contactButtons = document.querySelectorAll('.btn-contact');
    contactButtons.forEach(button => {
        button.addEventListener('click', function() {
            alert('Contact functionality - coming soon!');
        });
    });

    // Details button functionality
    const detailsButtons = document.querySelectorAll('.btn-details');
    detailsButtons.forEach(button => {
        button.addEventListener('click', function() {
            const card = this.closest('.game-card');
            // Toggle details expansion
            card.classList.toggle('expanded');
            // You can add more details expansion logic here
        });
    });

    // Add smooth scrolling for better UX
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});

// Add animation on scroll
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

// Observe all game cards
document.querySelectorAll('.game-card').forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(card);
});

