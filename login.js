document.addEventListener('DOMContentLoaded', () => {
    const usernameInput = document.getElementById('usernameInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginButton = document.getElementById('loginButton');
    const loginStatusMessage = document.getElementById('loginStatusMessage');

    // IMPORTANT: Replace 'localhost' with the actual IP address printed by your Python server (e.g., 'ws://192.168.1.100:8765')
    const WS_URL = 'ws://localhost:8765';
    let socket;

    // --- Initialize and Load Data from LocalStorage ---
    function initializeLogin() {
        const storedUsername = localStorage.getItem('chat_username');
        const storedPassword = localStorage.getItem('chat_password');

        if (storedUsername && storedPassword) {
            usernameInput.value = storedUsername;
            passwordInput.value = storedPassword;
            loginStatusMessage.textContent = 'Đang tự động đăng nhập...';
            loginStatusMessage.style.color = '#007bff';
            connectWebSocket(true); // Attempt auto-login
        } else {
            usernameInput.focus();
        }
    }

    /**
     * Establishes WebSocket connection and sends login request.
     * @param {boolean} isAutoLogin - Flag indicating if this is an auto-login attempt.
     */
    function connectWebSocket(isAutoLogin = false) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log("WebSocket already open, sending login request.");
            sendLoginRequest(isAutoLogin); // Just send login if already open
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
            sendLoginRequest(isAutoLogin); // Send login request once connection is open
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('Nhận dữ liệu từ server:', data);

            if (data.type === 'auth_response') {
                if (data.success) {
                    localStorage.setItem('chat_username', data.username);
                    localStorage.setItem('chat_password', passwordInput.value.trim()); // Save password for auto-login
                    window.location.href = 'index.html'; // Redirect to the chat page
                } else {
                    loginStatusMessage.textContent = `Đăng nhập thất bại: ${data.message}`;
                    loginStatusMessage.style.color = '#dc3545';
                    localStorage.removeItem('chat_username'); // Clear old login info
                    localStorage.removeItem('chat_password');
                    if (socket) socket.close(); // Close connection on failed login
                }
            }
            // Other messages (like chat history, user list) are handled by index.js after redirection.
        };

        socket.onclose = (event) => {
            console.log('Kết nối WebSocket đã đóng:', event);
            loginStatusMessage.textContent = 'Mất kết nối server. Vui lòng thử lại.';
            loginStatusMessage.style.color = '#dc3545';
        };

        socket.onerror = (error) => {
            console.error('Lỗi WebSocket:', error);
            loginStatusMessage.textContent = 'Lỗi kết nối. Vui lòng kiểm tra server hoặc kết nối mạng.';
            loginStatusMessage.style.color = '#dc3545';
        };
    }

    function sendLoginRequest(isAutoLogin) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'login',
                username: usernameInput.value.trim(),
                password: passwordInput.value.trim()
            }));
        } else {
            console.warn("WebSocket not open, cannot send login request.");
        }
    }


    /**
     * Handles the "Đăng nhập" button click event.
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
        connectWebSocket(false); // Manual login attempt
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

    // Initialize the login process
    initializeLogin();
});