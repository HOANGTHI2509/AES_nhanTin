document.addEventListener('DOMContentLoaded', () => {
    // Login screen elements
    const loginScreen = document.getElementById('login-screen');
    const usernameInput = document.getElementById('usernameInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginButton = document.getElementById('loginButton');
    const loginStatusMessage = document.getElementById('loginStatusMessage');

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
    let currentPassword = ''; // Storing password for auto-login
    let currentEncryptionKey = ''; // Storing encryption key

    // WebSocket server address.
    // ENSURE THIS ADDRESS POINTS TO YOUR WEBSOCKET PORT (default is 8765)
    // If your server is running on a different machine, replace 'localhost' with its IP.
    const WS_URL = 'ws://localhost:8765';
    let socket;

    // --- Initialize and Load Data from LocalStorage ---
    function initializeApp() {
        const storedUsername = localStorage.getItem('chat_username');
        const storedPassword = localStorage.getItem('chat_password');
        const storedEncryptionKey = localStorage.getItem('chat_encryption_key');

        if (storedUsername && storedPassword) {
            usernameInput.value = storedUsername;
            passwordInput.value = storedPassword;
            currentUsername = storedUsername; // Set for display
            currentPassword = storedPassword;
            // Attempt auto-login
            loginStatusMessage.textContent = 'Đang tự động đăng nhập...';
            loginStatusMessage.style.color = '#007bff';
            connectWebSocket(true); // Pass 'isAutoLogin' flag
        } else {
            showScreen(loginScreen);
            usernameInput.focus();
        }

        if (storedEncryptionKey) {
            encryptionKeyInput.value = storedEncryptionKey;
            currentEncryptionKey = storedEncryptionKey;
        }
    }

    /**
     * Switches between screens (login, chat).
     * @param {HTMLElement} screenToShow - The screen to display.
     */
    function showScreen(screenToShow) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        screenToShow.classList.add('active');
    }

    /**
     * Establishes WebSocket connection and sends login request.
     * @param {boolean} isAutoLogin - Flag indicating if this is an auto-login attempt.
     */
    function connectWebSocket(isAutoLogin = false) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log("WebSocket already open, no need to reconnect.");
            return;
        }

        socket = new WebSocket(WS_URL);

        socket.onopen = () => {
            console.log('Kết nối WebSocket đã mở.');
            if (isAutoLogin) {
                loginStatusMessage.textContent = 'Đang gửi yêu cầu đăng nhập tự động...';
            } else {
                loginStatusMessage.textContent = 'Đang gửi yêu cầu đăng nhập...';
            }
            // Send login request as soon as connection opens
            socket.send(JSON.stringify({
                type: 'login',
                username: usernameInput.value.trim(),
                password: passwordInput.value.trim()
            }));
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('Nhận dữ liệu từ server:', data);

            switch (data.type) {
                case 'auth_response':
                    if (data.success) {
                        currentUsername = data.username;
                        currentPassword = passwordInput.value.trim(); // Save password to maintain session
                        localStorage.setItem('chat_username', currentUsername);
                        localStorage.setItem('chat_password', currentPassword);

                        loggedInUsernameDisplay.textContent = currentUsername;
                        showScreen(chatScreen); // Switch to chat screen
                        chatStatusMessage.textContent = 'Đã kết nối và đăng nhập!';
                        chatStatusMessage.style.color = '#28a745';
                        sendMessageButton.disabled = false;
                        messageInput.focus(); // Focus on message input
                        // Update encryption key if present
                        if (encryptionKeyInput.value.trim()) {
                            localStorage.setItem('chat_encryption_key', encryptionKeyInput.value.trim());
                        }
                    } else {
                        loginStatusMessage.textContent = `Đăng nhập thất bại: ${data.message}`;
                        loginStatusMessage.style.color = '#dc3545';
                        localStorage.removeItem('chat_username'); // Clear old login info
                        localStorage.removeItem('chat_password');
                        currentUsername = '';
                        currentPassword = '';
                        showScreen(loginScreen); // Go back to login screen
                        socket.close(); // Close connection if login fails
                    }
                    break;
                case 'chat_message':
                    // Encrypted chat message from others
                    const messageType = data.sender === currentUsername ? 'sent' : 'received';
                    displayMessage(data.encrypted_data, data.sender, data.timestamp, messageType);
                    break;
                case 'status':
                    // Status message (e.g., A joined/left)
                    displayStatusMessage(data.message, data.timestamp);
                    break;
                case 'user_list':
                    // Update online user list
                    updateOnlineUsers(data.users);
                    break;
                case 'chat_history':
                    // Display chat history upon reception
                    displayChatHistory(data.history);
                    break;
                default:
                    console.warn('Loại tin nhắn không xác định:', data.type);
            }
        };

        socket.onclose = (event) => {
            console.log('Kết nối WebSocket đã đóng:', event);
            sendMessageButton.disabled = true; // Disable send button immediately

            if (currentUsername && currentPassword) { // If previously logged in successfully
                chatStatusMessage.textContent = 'Mất kết nối. Đang thử kết nối lại...';
                chatStatusMessage.style.color = '#dc3545';
                setTimeout(() => connectWebSocket(true), 3000); // Try to reconnect with auto-login
            } else { // If not logged in or login failed
                loginStatusMessage.textContent = 'Mất kết nối. Vui lòng thử lại.';
                loginStatusMessage.style.color = '#dc3545';
                showScreen(loginScreen);
            }
        };

        socket.onerror = (error) => {
            console.error('Lỗi WebSocket:', error);
            sendMessageButton.disabled = true;
            if (currentUsername) {
                chatStatusMessage.textContent = 'Lỗi kết nối. Đang thử kết nối lại...';
                chatStatusMessage.style.color = '#dc3545';
            } else {
                loginStatusMessage.textContent = 'Lỗi kết nối. Vui lòng kiểm tra server hoặc kết nối mạng.';
                loginStatusMessage.style.color = '#dc3545';
            }
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
        // Store encrypted text in a data attribute
        messageElement.setAttribute('data-encrypted-text', encryptedText);

        // Initially display encrypted message
        messageElement.textContent = `[Đã mã hóa] ${encryptedText}`;
        messageElement.style.fontStyle = 'italic';
        messageElement.style.color = '#6c757d';
        messageElement.classList.add('encrypted-display'); // Add a class for encrypted messages

        messageWrapper.appendChild(messageElement);
        messageBox.appendChild(messageWrapper);
        messageBox.scrollTop = messageBox.scrollHeight;

        // Add click event listener for decryption
        // Only add listener if the message looks like it might be encrypted
        if (encryptedText.startsWith('U2FsdGVkX')) { // CryptoJS AES encrypted messages start with this prefix
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
                        messageElement.style.color = ''; // Remove error color
                        messageElement.style.fontStyle = ''; // Remove italic style
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
            // Do not display status messages from history to avoid log spam
            // else if (msg.type === 'status') {
            //     displayStatusMessage(msg.message, msg.timestamp);
            // }
        });
        messageBox.scrollTop = messageBox.scrollHeight; // Ensure scroll to bottom after loading history
    }


    /**
     * Handles the "Login" button click event.
     */
    loginButton.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (username === '' || password === '') {
            loginStatusMessage.textContent = 'Vui lòng nhập đầy đủ tên người dùng và mật khẩu.';
            loginStatusMessage.style.color = '#dc3545';
            return;
        }
        loginStatusMessage.textContent = 'Đang cố gắng đăng nhập...';
        loginStatusMessage.style.color = '#6c757d';
        connectWebSocket(false); // Start connection and send manual login request
    });

    // Allow login with Enter key in password field
    passwordInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            loginButton.click();
        }
    });
    usernameInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            passwordInput.focus();
        }
    });

    /**
     * Handles the encryption key input change event.
     */
    encryptionKeyInput.addEventListener('input', () => {
        const newKey = encryptionKeyInput.value.trim();
        localStorage.setItem('chat_encryption_key', newKey);
        currentEncryptionKey = newKey; // Update global variable
        // No further action needed here; decryption will happen when messages are displayed
        // or when users click on old messages.
    });


    /**
     * Handles the "Send" message button click event.
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
            // Encrypt message before sending
            const encryptedMessage = CryptoJS.AES.encrypt(message, key).toString();
            const messagePayload = {
                type: 'chat_message',
                encrypted_data: encryptedMessage
                // Sender and timestamp will be added by the server
            };
            socket.send(JSON.stringify(messagePayload));

            // Display the sent message immediately for self
            const now = new Date();
            const timestamp = now.toTimeString().split(' ')[0].substring(0, 8); // HH:MM:SS
            displayMessage(encryptedMessage, currentUsername, timestamp, 'sent');
            messageInput.value = ''; // Clear input field
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

    // Initialize the app when the page loads
    initializeApp();
});