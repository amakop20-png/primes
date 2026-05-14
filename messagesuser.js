const textarea = document.querySelector('.compose-input');
const sendBtn = document.querySelector('.send-btn');
const msgList = document.querySelector('.messages');

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function appendMessage(role, text) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const group = document.createElement('div');
  const isUser = role === 'user';
  group.className = isUser ? 'msg-group admin' : 'msg-group';

  const avatar = isUser
    ? '<div class="msg-avatar av-purple" style="background: linear-gradient(135deg, #6366f1, #22d3ee);">YO</div>'
    : '<div class="msg-avatar av-cyan">AD</div>';

  const sender = isUser ? 'You' : 'Admin';
  const bubbleClass = isUser ? 'bubble admin-msg' : 'bubble user';

  group.innerHTML = `
    ${avatar}
    <div class="msg-content">
      <span class="msg-sender">${sender}</span>
      <div class="${bubbleClass}">${escapeHtml(text)}</div>
      <span class="msg-meta">${time}${isUser ? '' : ''}</span>
    </div>`;

  msgList.appendChild(group);
  msgList.scrollTop = msgList.scrollHeight;
}

function getAutoReply(message) {
  const text = message.toLowerCase();
  if (/refund|payment|charged|deducted|failed|pending|order/.test(text)) {
    return 'Thanks for reaching out. I’m reviewing your payment and will update you shortly.';
  }
  if (/address|profile|account|details/.test(text)) {
    return 'I can help with that. Please share the details so I can assist you properly.';
  }
  return 'Got it. I’m checking your request and will respond within a few minutes.';
}

function sendMessage() {
  const text = textarea.value.trim();
  if (!text) return;

  appendMessage('user', text);
  textarea.value = '';
  textarea.style.height = 'auto';

  setTimeout(() => {
    const reply = getAutoReply(text);
    appendMessage('admin', reply);
  }, 900);
}

sendBtn.addEventListener('click', sendMessage);
textarea.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
