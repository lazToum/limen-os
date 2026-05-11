import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:record/record.dart';
import 'package:permission_handler/permission_handler.dart';
import '../services/limen.dart';

/// Voice relay screen — streams mic audio to the desktop as PCM chunks.
class VoiceScreen extends ConsumerStatefulWidget {
  const VoiceScreen({super.key});

  @override
  ConsumerState<VoiceScreen> createState() => _VoiceScreenState();
}

class _VoiceScreenState extends ConsumerState<VoiceScreen> {
  final _recorder = AudioRecorder();
  bool _relaying = false;
  bool _hasPermission = false;
  String _statusText = 'Tap to relay voice';
  int _seq = 0;
  StreamSubscription<RecordState>? _recorderSub;

  @override
  void initState() {
    super.initState();
    _checkPermission();
  }

  Future<void> _checkPermission() async {
    final status = await Permission.microphone.status;
    if (mounted) setState(() => _hasPermission = status.isGranted);
  }

  Future<void> _toggle() async {
    if (!_hasPermission) {
      final status = await Permission.microphone.request();
      if (!status.isGranted) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Microphone permission denied')),
          );
        }
        return;
      }
      if (mounted) setState(() => _hasPermission = true);
    }

    HapticFeedback.mediumImpact();

    if (_relaying) {
      await _stopRelay();
    } else {
      await _startRelay();
    }
  }

  Future<void> _startRelay() async {
    final svc = ref.read(limenServiceProvider);
    if (!svc.status.isConnected) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Not connected to desktop')),
        );
      }
      return;
    }

    _seq = 0;
    svc.voiceStart();

    final stream = await _recorder.startStream(
      const RecordConfig(
        encoder: AudioEncoder.pcm16bits,
        sampleRate: 16000,
        numChannels: 1,
      ),
    );

    stream.listen((chunk) {
      svc.voiceChunk(chunk, _seq++);
    });

    _recorderSub = _recorder.onStateChanged().listen((state) {
      if (state == RecordState.stop && _relaying && mounted) {
        setState(() {
          _relaying = false;
          _statusText = 'Tap to relay voice';
        });
      }
    });

    if (mounted) {
      setState(() {
        _relaying = true;
        _statusText = 'Relaying to desktop…';
      });
    }
  }

  Future<void> _stopRelay() async {
    await _recorder.stop();
    _recorderSub?.cancel();
    _recorderSub = null;
    ref.read(limenServiceProvider).voiceEnd();
    if (mounted) {
      setState(() {
        _relaying = false;
        _statusText = 'Tap to relay voice';
      });
    }
  }

  @override
  void dispose() {
    _recorder.dispose();
    _recorderSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Mic button.
          GestureDetector(
            onTap: _toggle,
            child: AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  width: 128,
                  height: 128,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _relaying ? cs.primary : cs.surfaceContainerHighest,
                    boxShadow:
                        _relaying
                            ? [
                              BoxShadow(
                                color: cs.primary.withValues(alpha: 0.35),
                                blurRadius: 36,
                                spreadRadius: 8,
                              ),
                            ]
                            : const [],
                  ),
                  child: Icon(
                    _relaying ? Icons.mic : Icons.mic_off,
                    size: 52,
                    color: _relaying ? cs.onPrimary : cs.onSurfaceVariant,
                  ),
                )
                .animate(
                  onPlay: (c) => c.repeat(reverse: true),
                  target: _relaying ? 1 : 0,
                )
                .scaleXY(
                  begin: 1.0,
                  end: 1.06,
                  duration: 700.ms,
                  curve: Curves.easeInOut,
                ),
          ),
          const SizedBox(height: 28),
          Text(_statusText, style: Theme.of(context).textTheme.bodyLarge),
          const SizedBox(height: 8),
          Text(
            'Say "Hey Limen…"',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: cs.onSurface.withValues(alpha: 0.45),
            ),
          ),
          if (!_hasPermission) ...[
            const SizedBox(height: 16),
            TextButton.icon(
              onPressed: _toggle,
              icon: const Icon(Icons.mic),
              label: const Text('Grant microphone access'),
            ),
          ],
        ],
      ),
    );
  }
}
