import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/limen.dart';

/// Virtual trackpad + quick-action buttons.
///
/// - Single finger drag → mouse delta
/// - Single tap → left click
/// - Two-finger tap → right click
/// - Two-finger vertical drag → scroll
/// - Action bar: Back (Escape), Home, Apps (Launcher), Lock
class RemoteScreen extends ConsumerStatefulWidget {
  const RemoteScreen({super.key});

  @override
  ConsumerState<RemoteScreen> createState() => _RemoteScreenState();
}

class _RemoteScreenState extends ConsumerState<RemoteScreen> {
  static const _sensitivity = 1.8;

  // Two-finger scroll tracking.
  int _pointerCount = 0;

  void _onPanUpdate(DragUpdateDetails d) {
    final svc = ref.read(limenServiceProvider);
    svc.mouseDelta(d.delta.dx * _sensitivity, d.delta.dy * _sensitivity);
  }

  void _onTap() {
    HapticFeedback.lightImpact();
    ref.read(limenServiceProvider).mouseClick('left');
  }

  void _onSecondaryTap() {
    HapticFeedback.mediumImpact();
    ref.read(limenServiceProvider).mouseClick('right');
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Column(
      children: [
        // ── Trackpad ────────────────────────────────────────────────────────
        Expanded(
          child: Listener(
            onPointerDown: (_) => _pointerCount++,
            onPointerUp: (_) {
              _pointerCount = (_pointerCount - 1).clamp(0, 10);
            },
            child: GestureDetector(
              onPanUpdate: _onPanUpdate,
              onTap: _onTap,
              onSecondaryTap: _onSecondaryTap,
              onVerticalDragUpdate: (d) {
                // Only treat as scroll if 2+ fingers (Listener tracks count).
                if (_pointerCount >= 2) {
                  ref.read(limenServiceProvider).mouseScroll(d.delta.dy);
                }
              },
              child: Container(
                margin: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: cs.surfaceContainerHighest.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: cs.outline.withValues(alpha: 0.25),
                    width: 1.5,
                  ),
                ),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.touch_app_outlined,
                        size: 32,
                        color: cs.onSurface.withValues(alpha: 0.2),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Trackpad',
                        style: TextStyle(
                          color: cs.onSurface.withValues(alpha: 0.2),
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),

        // ── Quick-click row ──────────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Expanded(child: _ClickButton(label: 'Left', onTap: _onTap)),
              const SizedBox(width: 8),
              Expanded(
                child: _ClickButton(label: 'Right', onTap: _onSecondaryTap),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),

        // ── Action bar ───────────────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _ActionButton(
                icon: Icons.arrow_back,
                label: 'Back',
                onTap: () {
                  HapticFeedback.lightImpact();
                  ref.read(limenServiceProvider).send({
                    'type': 'key',
                    'key': 'Escape',
                    'modifiers': <String>[],
                  });
                },
              ),
              _ActionButton(
                icon: Icons.home_outlined,
                label: 'Home',
                onTap: () {
                  HapticFeedback.lightImpact();
                  ref.read(limenServiceProvider).setScene('home');
                },
              ),
              _ActionButton(
                icon: Icons.apps,
                label: 'Apps',
                onTap: () {
                  HapticFeedback.lightImpact();
                  ref.read(limenServiceProvider).setScene('launcher');
                },
              ),
              _ActionButton(
                icon: Icons.lock_outline,
                label: 'Lock',
                onTap: () {
                  HapticFeedback.heavyImpact();
                  ref.read(limenServiceProvider).setScene('greeter');
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ─── Sub-widgets ──────────────────────────────────────────────────────────────

class _ClickButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _ClickButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 44,
        decoration: BoxDecoration(
          color: cs.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: cs.outline.withValues(alpha: 0.2)),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w500,
              color: cs.onSurface.withValues(alpha: 0.7),
            ),
          ),
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: cs.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: cs.primary, size: 22),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: cs.onSurface.withValues(alpha: 0.7),
            ),
          ),
        ],
      ),
    );
  }
}
