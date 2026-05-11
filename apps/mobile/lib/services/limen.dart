import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ─── Connection state ─────────────────────────────────────────────────────────

enum ConnectionStatus { disconnected, connecting, connected, error }

class LimenConnectionState {
  final ConnectionStatus status;
  final String? errorMessage;
  const LimenConnectionState(this.status, [this.errorMessage]);
  bool get isConnected => status == ConnectionStatus.connected;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/// WebSocket client for the limen-core companion API (port 8731).
///
/// Protocol: newline-delimited JSON.
///
/// Sent (mobile → desktop):
///   { "type": "mouse_delta",  "dx": float, "dy": float }
///   { "type": "mouse_click",  "button": "left"|"right"|"middle" }
///   { "type": "mouse_scroll", "dy": float }
///   { "type": "key",          "key": string, "modifiers": [string] }
///   { "type": "scene",        "name": string }
///   { "type": "voice_start" }
///   { "type": "voice_chunk",  "data": base64, "seq": int }
///   { "type": "voice_end" }
///   { "type": "ping" }
///
/// Received (desktop → mobile):
///   { "type": "pong" }
///   { "type": "scene_changed", "name": string }
///   { "type": "notification",  "title": string, "body": string }
class LimenService {
  WebSocketChannel? _channel;

  final _statusCtrl = StreamController<LimenConnectionState>.broadcast();
  final _msgCtrl = StreamController<Map<String, dynamic>>.broadcast();

  Stream<LimenConnectionState> get statusStream => _statusCtrl.stream;
  Stream<Map<String, dynamic>> get messageStream => _msgCtrl.stream;

  LimenConnectionState _status = const LimenConnectionState(
    ConnectionStatus.disconnected,
  );

  LimenConnectionState get status => _status;

  Timer? _pingTimer;
  Timer? _reconnectTimer;
  String? _lastHost;
  bool _disposed = false;

  // ── Persistence ────────────────────────────────────────────────────────────

  static Future<String> savedHost() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('limen_host') ?? '';
  }

  static Future<void> saveHost(String host) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('limen_host', host);
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  Future<void> connect(String host) async {
    _lastHost = host;
    await saveHost(host);
    await _doConnect(host);
  }

  Future<void> _doConnect(String host) async {
    if (_disposed) return;
    _emit(const LimenConnectionState(ConnectionStatus.connecting));
    _channel?.sink.close();

    try {
      final uri = Uri.parse('ws://$host/companion');
      _channel = WebSocketChannel.connect(uri);
      await _channel!.ready;
      _emit(const LimenConnectionState(ConnectionStatus.connected));

      _channel!.stream.listen(
        (raw) {
          try {
            final msg = jsonDecode(raw as String) as Map<String, dynamic>;
            _msgCtrl.add(msg);
          } catch (_) {}
        },
        onDone: () => _handleDisconnect(),
        onError:
            (Object e) => _emit(
              LimenConnectionState(ConnectionStatus.error, e.toString()),
            ),
        cancelOnError: true,
      );

      _pingTimer?.cancel();
      _pingTimer = Timer.periodic(
        const Duration(seconds: 10),
        (_) => send({'type': 'ping'}),
      );
    } catch (e) {
      _emit(LimenConnectionState(ConnectionStatus.error, e.toString()));
      _scheduleReconnect();
    }
  }

  void _handleDisconnect() {
    if (_disposed) return;
    _emit(const LimenConnectionState(ConnectionStatus.disconnected));
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 3), () {
      if (!_disposed && _lastHost != null) _doConnect(_lastHost!);
    });
  }

  void disconnect() {
    _pingTimer?.cancel();
    _reconnectTimer?.cancel();
    _channel?.sink.close();
    _channel = null;
    _emit(const LimenConnectionState(ConnectionStatus.disconnected));
  }

  void _emit(LimenConnectionState s) {
    _status = s;
    if (!_statusCtrl.isClosed) _statusCtrl.add(s);
  }

  // ── Send ───────────────────────────────────────────────────────────────────

  bool send(Map<String, dynamic> msg) {
    if (_channel == null) return false;
    try {
      _channel!.sink.add(jsonEncode(msg));
      return true;
    } catch (_) {
      return false;
    }
  }

  void mouseDelta(double dx, double dy) =>
      send({'type': 'mouse_delta', 'dx': dx, 'dy': dy});

  void mouseClick(String button) =>
      send({'type': 'mouse_click', 'button': button});

  void mouseScroll(double dy) => send({'type': 'mouse_scroll', 'dy': dy});

  void setScene(String name) => send({'type': 'scene', 'name': name});

  void voiceStart() => send({'type': 'voice_start'});
  void voiceEnd() => send({'type': 'voice_end'});

  void voiceChunk(Uint8List pcm, int seq) =>
      send({'type': 'voice_chunk', 'data': base64.encode(pcm), 'seq': seq});

  void dispose() {
    _disposed = true;
    disconnect();
    _statusCtrl.close();
    _msgCtrl.close();
  }
}

// ─── Providers ────────────────────────────────────────────────────────────────

final limenServiceProvider = Provider<LimenService>((ref) {
  final svc = LimenService();
  ref.onDispose(svc.dispose);
  return svc;
});

/// Streams connection status updates from the service.
final connectionStatusProvider = StreamProvider<LimenConnectionState>((ref) {
  final svc = ref.watch(limenServiceProvider);
  return svc.statusStream;
});

/// Streams inbound messages from the desktop.
final desktopMessageProvider = StreamProvider<Map<String, dynamic>>((ref) {
  final svc = ref.watch(limenServiceProvider);
  return svc.messageStream;
});
