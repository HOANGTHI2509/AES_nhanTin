document.addEventListener('DOMContentLoaded', () => {
    // Chat screen elements
    const chatScreen = document.getElementById('chat-screen');
    const loggedInUsernameDisplay = document.getElementById('loggedInUsername');
    const onlineUsersList = document.getElementById('onlineUsersList');
    const messageBox = document.getElementById('messageBox');
    const messageInput = document.getElementById('messageInput');
    const encryptionKeyInput = document.getElementById('encryptionKey');
    const sendMessageButton = document.getElementById('sendMessageButton');
    const chatStatusMessage = document.getElementById('chatStatusMessage');

    // Global variables to store current user info
    let currentUsername = '';
    let currentPassword = ''; // Storing password for re-connection
    let currentEncryptionKey = ''; // Storing encryption key

    // IMPORTANT: Replace 'localhost' with the actual IP address printed by your Python server (e.g., 'ws://192.168.1.100:8765')
    const WS_URL = 'ws://localhost:8765';
    let socket;

    // --- Initialize and Load Data from LocalStorage ---
    function initializeChatApp() {
        const storedUsername = localStorage.getItem('chat_username');
        const storedPassword = localStorage.getItem('chat_password');
        const storedEncryptionKey = localStorage.getItem('chat_encryption_key');

        if (!storedUsername || !storedPassword) {
            // If no username/password, redirect back to login
            window.location.href = 'login.html';
            return;
        }

        currentUsername = storedUsername;
        currentPassword = storedPassword;
        loggedInUsernameDisplay.textContent = currentUsername; // Display username

        if (storedEncryptionKey) {
            encryptionKeyInput.value = storedEncryptionKey;
            currentEncryptionKey = storedEncryptionKey;
        }

        connectWebSocket(); // Connect to WebSocket
    }

    /**
     * Establishes WebSocket connection and sends re-authentication request.
     */
    function connectWebSocket() {
        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log("WebSocket already open.");
            return;
        }

        socket = new WebSocket(WS_URL);

        socket.onopen = () => {
            console.log('Kết nối WebSocket đã mở. Đang xác thực lại...');
            chatStatusMessage.textContent = 'Đã kết nối. Đang xác thực lại...';
            chatStatusMessage.style.color = '#007bff';
            // Re-authenticate when connection opens on the chat page
            socket.send(JSON.stringify({
                type: 'login', // Re-use login type for re-authentication
                username: currentUsername,
                password: currentPassword
            }));
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('Nhận dữ liệu từ server:', data);

            switch (data.type) {
                case 'auth_response':
                    if (data.success) {
                        chatStatusMessage.textContent = 'Đã kết nối và đăng nhập!';
                        chatStatusMessage.style.color = '#28a745';
                        sendMessageButton.disabled = false;
                        messageInput.focus();
                    } else {
                        // Authentication failed on chat page, likely due to session expiry or changed password
                        chatStatusMessage.textContent = `Xác thực lại thất bại: ${data.message}. Vui lòng đăng nhập lại.`;
                        chatStatusMessage.style.color = '#dc3545';
                        localStorage.removeItem('chat_username');
                        localStorage.removeItem('chat_password');
                        window.location.href = 'login.html'; // Redirect to login
                        socket.close();
                    }
                    break;
                case 'chat_message':
                    const messageType = data.sender === currentUsername ? 'sent' : 'received';
                    displayMessage(data.encrypted_data, data.sender, data.timestamp, messageType);
                    break;
                case 'status':
                    displayStatusMessage(data.message, data.timestamp);
                    break;
                case 'user_list':
                    updateOnlineUsers(data.users);
                    break;
                case 'chat_history':
                    displayChatHistory(data.history);
                    break;
                default:
                    console.warn('Loại tin nhắn không xác định:', data.type);
            }
        };

        socket.onclose = (event) => {
            console.log('Kết nối WebSocket đã đóng:', event);
            sendMessageButton.disabled = true;

            chatStatusMessage.textContent = 'Mất kết nối. Đang thử kết nối lại...';
            chatStatusMessage.style.color = '#dc3545';
            setTimeout(connectWebSocket, 3000); // Try to reconnect after 3 seconds
        };

        socket.onerror = (error) => {
            console.error('Lỗi WebSocket:', error);
            sendMessageButton.disabled = true;
            chatStatusMessage.textContent = 'Lỗi kết nối. Đang thử kết nối lại...';
            chatStatusMessage.style.color = '#dc3545';
        };
    }

    /**
     * Displays a chat message in the message box.
     * @param {string} encryptedText - The encrypted message content.
     * @param {string} sender - The sender's name.
     * @param {string} timestamp - The sent time (HH:MM:SS).
     * @param {string} type - 'sent' (from you) or 'received' (from others).
     */
    function displayMessage(encryptedText, sender, timestamp, type) {
        const messageWrapper = document.createElement('div');
        messageWrapper.classList.add('message-wrapper', type);

        const messageInfo = document.createElement('div');
        messageInfo.classList.add('message-info');
        messageInfo.textContent = `${sender} lúc ${timestamp}`;
        messageWrapper.appendChild(messageInfo);

        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.setAttribute('data-encrypted-text', encryptedText);

        messageElement.textContent = `[Đã mã hóa] ${encryptedText}`;
        messageElement.style.fontStyle = 'italic';
        messageElement.style.color = '#6c757d';
        messageElement.classList.add('encrypted-display');

        messageWrapper.appendChild(messageElement);
        messageBox.appendChild(messageWrapper);
        messageBox.scrollTop = messageBox.scrollHeight;

        if (encryptedText.startsWith('U2FsdGVkX')) { // Check if it looks like a CryptoJS encrypted string
            messageElement.addEventListener('click', () => {
                const clickedEncryptedText = messageElement.getAttribute('data-encrypted-text');
                const currentKey = encryptionKeyInput.value.trim();

                if (currentKey.length === 0) {
                    alert('Vui lòng nhập khóa mã hóa vào ô phía trên để giải mã!');
                    return;
                }

                try {
                    const decryptedBytes = CryptoJS.AES.decrypt(clickedEncryptedText, currentKey);
                    const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);

                    if (decryptedText) { // Ensure valid content is decrypted
                        messageElement.textContent = decryptedText;
                        messageElement.classList.remove('encrypted-display', 'decryption-error');
                        messageElement.classList.add('decrypted-on-click');
                        messageElement.style.color = ''; // Reset color
                        messageElement.style.fontStyle = ''; // Reset font style
                    } else {
                        throw new Error("Empty decrypted text");
                    }
                } catch (e) {
                    console.error('Lỗi giải mã khi nhấp:', e);
                    messageElement.textContent = `[Giải mã thất bại! Sai khóa?] ${clickedEncryptedText}`;
                    messageElement.classList.remove('encrypted-display');
                    messageElement.classList.add('decryption-error');
                    messageElement.style.color = '#dc3545';
                    messageElement.style.fontStyle = 'italic';
                }
            });
        }
    }

    /**
     * Displays a status message (e.g., A joined/left).
     * @param {string} statusText - The status message content.
     * @param {string} timestamp - The timestamp (HH:MM:SS).
     */
    function displayStatusMessage(statusText, timestamp) {
        const messageWrapper = document.createElement('div');
        messageWrapper.classList.add('message-wrapper', 'status');

        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.textContent = `[${timestamp}] ${statusText}`;

        messageWrapper.appendChild(messageElement);
        messageBox.appendChild(messageWrapper);
        messageBox.scrollTop = messageBox.scrollHeight;
    }

    /**
     * Updates the list of online users.
     * @param {Array<string>} users - Array of online usernames.
     */
    function updateOnlineUsers(users) {
        onlineUsersList.textContent = users.join(', ');
    }

    /**
     * Displays chat history when the user logs in.
     * @param {Array<Object>} history - Array of message objects from history.
     */
    function displayChatHistory(history) {
        messageBox.innerHTML = ''; // Clear old messages before displaying history
        if (history.length === 0) {
            displayStatusMessage("Chưa có tin nhắn nào trong lịch sử.", new Date().toTimeString().split(' ')[0].substring(0, 8));
        }
        history.forEach(msg => {
            if (msg.type === 'chat_message') {
                const messageType = msg.sender === currentUsername ? 'sent' : 'received';
                displayMessage(msg.encrypted_data, msg.sender, msg.timestamp, messageType);
            }
        });
        messageBox.scrollTop = messageBox.scrollHeight;
    }

    /**
     * Handles the encryption key input change event.
     */
    encryptionKeyInput.addEventListener('input', () => {
        const newKey = encryptionKeyInput.value.trim();
        localStorage.setItem('chat_encryption_key', newKey);
        currentEncryptionKey = newKey;
    });


    /**
     * Handles the "Gửi" message button click event.
     */
    sendMessageButton.addEventListener('click', () => {
        const message = messageInput.value.trim();
        const key = encryptionKeyInput.value.trim();

        if (message === '') {
            alert('Vui lòng nhập tin nhắn!');
            return;
        }

        if (key === '') {
            alert('Vui lòng nhập khóa mã hóa!');
            return;
        }

        if (socket.readyState !== WebSocket.OPEN) {
            alert('Kết nối WebSocket chưa sẵn sàng hoặc đã đóng. Vui lòng đợi hoặc thử lại.');
            return;
        }

        try {
            const encryptedMessage = CryptoJS.AES.encrypt(message, key).toString();
            const messagePayload = {
                type: 'chat_message',
                encrypted_data: encryptedMessage
            };
            socket.send(JSON.stringify(messagePayload));

            const now = new Date();
            const timestamp = now.toTimeString().split(' ')[0].substring(0, 8);
            displayMessage(encryptedMessage, currentUsername, timestamp, 'sent');
            messageInput.value = '';
        } catch (e) {
            alert('Lỗi khi mã hóa tin nhắn. Vui lòng kiểm tra khóa.');
            console.error('Lỗi mã hóa:', e);
        }
    });

    // Allow sending messages with Enter key
    messageInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            sendMessageButton.click();
        }
    });

    // Initialize the chat app when the page loads
    initializeChatApp();
});