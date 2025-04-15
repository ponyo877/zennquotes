console.log('Zenn Quotes content script loaded.');

/**
 * Displays a notification modal on the page.
 * @param message The message to display in the notification.
 */
function showNotificationModal(message: string): void {
  // Remove existing modal if any
  const existingModal = document.querySelector('.zenn-quotes-notification');
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal element
  const modal = document.createElement('div');
  modal.classList.add('zenn-quotes-notification');
  modal.textContent = message;
  document.body.appendChild(modal);

  // Trigger fade-in animation
  // Use setTimeout to ensure the transition applies after the element is added to the DOM
  setTimeout(() => {
    modal.classList.add('show');
  }, 10); // Small delay

  // Set timeout to fade out and remove the modal
  setTimeout(() => {
    modal.classList.remove('show');
    // Remove the element after the fade-out transition completes
    modal.addEventListener('transitionend', () => {
      modal.remove();
    }, { once: true });
  }, 3000); // Display for 3 seconds
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'show-quote-notification') {
    console.log('Received show-quote-notification message');
    showNotificationModal('Zennの引用リンクをコピーしました!');
    // Optionally send a response back to the background script
    sendResponse({ status: 'Notification shown' });
  }
  // Keep the message channel open for asynchronous response
  return true;
});

// Example usage for testing (can be removed later)
// setTimeout(() => {
//   showNotificationModal('テスト通知です！');
// }, 2000);
