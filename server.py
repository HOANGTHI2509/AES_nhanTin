import asyncio
import websockets
import json
from datetime import datetime
import os

# --- Cấu hình ---
# Định nghĩa các tài khoản người dùng cứng
VALID_USERS = {
    "user1": "pass123",
    "user2": "pass123",
    "user3": "pass123",
    "user4": "pass123",
    "user5": "pass123"
}

# Tên file để lưu lịch sử chat
HISTORY_FILE = 'chat_history.json'

# --- Biến toàn cục ---
# Dictionary để lưu trữ các client đã kết nối và được xác thực.
# Key: websocket object, Value: Dictionary chứa thông tin user (ví dụ: {'name': 'Tên người dùng'})
connected_clients = {}

# Lịch sử chat được tải vào bộ nhớ khi server khởi động
chat_history = []

# --- Hàm hỗ trợ ---

def load_chat_history():
    """Tải lịch sử chat từ file."""
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                print(f"Cảnh báo: File lịch sử '{HISTORY_FILE}' bị lỗi định dạng JSON. Bắt đầu với lịch sử rỗng.")
                return []
    return []

def save_chat_history(message):
    """Lưu một tin nhắn vào lịch sử và ghi ra file."""
    chat_history.append(message)
    # Giới hạn lịch sử (ví dụ: 1000 tin nhắn gần nhất) để tránh file quá lớn
    if len(chat_history) > 1000:
        chat_history.pop(0) # Xóa tin nhắn cũ nhất

    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(chat_history, f, ensure_ascii=False, indent=2)

async def notify_users_status(message_content, exclude_websocket=None):
    """
    Gửi thông báo trạng thái (ai đã tham gia/rời đi) đến tất cả người dùng.
    """
    status_message = {
        'type': 'status',
        'sender': 'System', # Người gửi là System
        'message': message_content,
        'timestamp': datetime.now().strftime("%H:%M:%S")
    }
    # Lưu tin nhắn trạng thái vào lịch sử (tùy chọn, nếu bạn muốn hiển thị trong lịch sử cũ)
    # save_chat_history(status_message)
    await broadcast_message(json.dumps(status_message), exclude_websocket=exclude_websocket)

async def register_user(websocket, username):
    """Đăng ký người dùng mới đã được xác thực."""
    connected_clients[websocket] = {'name': username}
    print(f"Người dùng '{username}' đã kết nối từ {websocket.remote_address}. Tổng số user: {len(connected_clients)}")
    await notify_users_status(f"'{username}' đã tham gia cuộc trò chuyện.", exclude_websocket=websocket)
    
    # Gửi lịch sử chat cho người dùng mới
    await send_chat_history(websocket)
    # Gửi lại danh sách người dùng đang online
    await send_user_list_to_all()

async def unregister_user(websocket):
    """Hủy đăng ký người dùng khi ngắt kết nối."""
    if websocket in connected_clients:
        username = connected_clients[websocket]['name']
        del connected_clients[websocket]
        print(f"Người dùng '{username}' đã ngắt kết nối từ {websocket.remote_address}. Tổng số user: {len(connected_clients)}")
        await notify_users_status(f"'{username}' đã rời cuộc trò chuyện.")
        await send_user_list_to_all() # Cập nhật danh sách người dùng online


async def send_user_list_to_all():
    """Gửi danh sách người dùng đang online cho tất cả các client."""
    online_users = [info['name'] for info in connected_clients.values()]
    user_list_message = {
        'type': 'user_list',
        'users': online_users
    }
    await broadcast_message(json.dumps(user_list_message))

async def send_chat_history(websocket):
    """Gửi lịch sử chat cho một client cụ thể."""
    history_message = {
        'type': 'chat_history',
        'history': chat_history
    }
    try:
        await websocket.send(json.dumps(history_message))
        print(f"Đã gửi {len(chat_history)} tin nhắn lịch sử đến {connected_clients[websocket]['name']}")
    except websockets.exceptions.ConnectionClosed:
        print(f"Không thể gửi lịch sử chat đến client đã đóng kết nối.")


async def broadcast_message(message, exclude_websocket=None):
    """
    Phát sóng tin nhắn đến tất cả các client đã đăng nhập.
    Nếu có exclude_websocket, không gửi lại cho chính người gửi.
    """
    if connected_clients:
        clients_to_send = list(connected_clients.keys())
        for client in clients_to_send:
            if client != exclude_websocket:
                try:
                    await client.send(message)
                except websockets.exceptions.ConnectionClosed:
                    print(f"Cảnh báo: Không thể gửi tin nhắn đến client đã đóng kết nối.")


async def websocket_handler(websocket):
    """
    Xử lý các kết nối WebSocket mới, xác thực và tin nhắn đến.
    """
    current_username = None
    try:
        # Bước 1: Nhận yêu cầu đăng nhập
        auth_message = await websocket.recv()
        auth_data = json.loads(auth_message)

        if auth_data.get('type') == 'login' and 'username' in auth_data and 'password' in auth_data:
            username = auth_data['username']
            password = auth_data['password']

            if username in VALID_USERS and VALID_USERS[username] == password:
                if username in [info['name'] for info in connected_clients.values()]:
                    await websocket.send(json.dumps({'type': 'auth_response', 'success': False, 'message': 'Tên người dùng đã online.'}))
                    print(f"Người dùng '{username}' cố gắng đăng nhập lại khi đã online.")
                    return
                else:
                    await websocket.send(json.dumps({'type': 'auth_response', 'success': True, 'username': username}))
                    current_username = username
                    await register_user(websocket, current_username)
            else:
                await websocket.send(json.dumps({'type': 'auth_response', 'success': False, 'message': 'Tên người dùng hoặc mật khẩu không đúng.'}))
                print(f"Thử đăng nhập thất bại từ {websocket.remote_address} cho user: {username}")
                return
        else:
            await websocket.send(json.dumps({'type': 'auth_response', 'success': False, 'message': 'Yêu cầu đăng nhập không hợp lệ.'}))
            print(f"Client {websocket.remote_address} không gửi yêu cầu đăng nhập hợp lệ.")
            return

        # Bước 2: Lắng nghe và chuyển tiếp tin nhắn sau khi đăng nhập thành công
        async for message_from_client in websocket:
            print(f"Nhận được tin nhắn từ '{current_username}': {message_from_client}")
            message_data = json.loads(message_from_client)

            if message_data.get('type') == 'chat_message':
                message_data['sender'] = current_username
                message_data['timestamp'] = datetime.now().strftime("%H:%M:%S")

                # Lưu tin nhắn vào lịch sử trước khi broadcast
                save_chat_history(message_data)

                # Phát sóng tin nhắn (đã mã hóa) đến tất cả các client khác đã đăng nhập
                await broadcast_message(json.dumps(message_data), exclude_websocket=websocket)
            else:
                print(f"Loại tin nhắn không hợp lệ từ '{current_username}': {message_data.get('type')}")


    except websockets.exceptions.ConnectionClosed as e:
        print(f"Người dùng '{current_username if current_username else 'Unknown'}' đã ngắt kết nối: {e.code}, {e.reason}")
    except json.JSONDecodeError:
        print(f"Client {websocket.remote_address} gửi tin nhắn không phải JSON.")
    except Exception as e:
        print(f"Lỗi không xác định với client {websocket.remote_address}: {e}")
    finally:
        if current_username:
            await unregister_user(websocket)

async def main():
    """
    Khởi động WebSocket server và tải lịch sử chat.
    """
    global chat_history
    chat_history = load_chat_history()
    print(f"Đã tải {len(chat_history)} tin nhắn từ lịch sử chat.")

    async with websockets.serve(websocket_handler, host="0.0.0.0", port=8765):
        print("Server WebSocket đang lắng nghe tại ws://0.0.0.0:8765")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())