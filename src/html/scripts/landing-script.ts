/**
 * Landing page JavaScript
 */
export function landingScript(): string {
  return `
    (function() {
      let selectedTTL = '7d';

      // TTL selection
      const ttlButtons = document.querySelectorAll('.ttl-btn');
      ttlButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          ttlButtons.forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedTTL = btn.dataset.ttl;
        });
      });

      // Create button
      const createBtn = document.getElementById('create-btn');
      const btnText = createBtn.querySelector('.create-btn-text');
      const btnLoading = createBtn.querySelector('.create-btn-loading');

      createBtn.addEventListener('click', async () => {
        // Show loading state
        createBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-flex';

        try {
          const response = await fetch('/api/docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ttl: selectedTTL })
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to create document');
          }

          const data = await response.json();
          
          // Redirect to the new document
          window.location.href = data.url;

        } catch (error) {
          console.error('Create error:', error);
          alert(error.message || 'Failed to create document. Please try again.');
          
          // Reset button
          createBtn.disabled = false;
          btnText.style.display = 'inline';
          btnLoading.style.display = 'none';
        }
      });

      // Keyboard shortcut: Enter to create
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !createBtn.disabled) {
          createBtn.click();
        }
      });
    })();
  `;
}
