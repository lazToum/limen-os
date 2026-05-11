import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/limen.dart';

/// Slim status banner shown at the top of every screen.
/// Hidden when connected; visible as a thin coloured bar otherwise.
class ConnectionBanner extends ConsumerWidget {
  const ConnectionBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final statusAsync = ref.watch(connectionStatusProvider);

    return statusAsync.when(
      data: (s) {
        if (s.status == ConnectionStatus.connected) {
          return const SizedBox.shrink();
        }
        final (color, label) = switch (s.status) {
          ConnectionStatus.connecting => (cs.primary, 'Connecting…'),
          ConnectionStatus.error => (
            cs.error,
            'Error: ${s.errorMessage ?? "unknown"}',
          ),
          _ => (cs.onSurface.withValues(alpha: 0.4), 'Not connected'),
        };
        return _Banner(color: color, label: label);
      },
      loading: () => _Banner(color: cs.primary, label: 'Connecting…'),
      error: (e, _) => _Banner(color: cs.error, label: 'Error: $e'),
    );
  }
}

class _Banner extends StatelessWidget {
  final Color color;
  final String label;
  const _Banner({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
          width: double.infinity,
          color: color.withValues(alpha: 0.12),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          child: Row(
            children: [
              SizedBox(
                width: 10,
                height: 10,
                child: CircularProgressIndicator(
                  strokeWidth: 1.5,
                  color: color,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(fontSize: 12, color: color),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        )
        .animate()
        .fadeIn(duration: 200.ms)
        .slideY(begin: -0.5, end: 0, curve: Curves.easeOut);
  }
}
