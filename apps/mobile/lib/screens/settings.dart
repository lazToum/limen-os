import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/limen.dart';

/// Settings screen — configure desktop host address, view connection status.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  late final TextEditingController _hostCtrl;
  bool _connecting = false;

  @override
  void initState() {
    super.initState();
    _hostCtrl = TextEditingController();
    _loadSaved();
  }

  Future<void> _loadSaved() async {
    final host = await LimenService.savedHost();
    if (mounted) _hostCtrl.text = host;
  }

  Future<void> _connect() async {
    final host = _hostCtrl.text.trim();
    if (host.isEmpty) return;
    setState(() => _connecting = true);
    final svc = ref.read(limenServiceProvider);
    await svc.connect(host);
    if (mounted) setState(() => _connecting = false);
  }

  @override
  void dispose() {
    _hostCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final connStatus = ref.watch(connectionStatusProvider);

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Desktop Connection',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 12),

        TextField(
          controller: _hostCtrl,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: InputDecoration(
            labelText: 'Host (e.g. 192.168.1.50:8766)',
            border: const OutlineInputBorder(),
            suffixIcon:
                _connecting
                    ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                    : IconButton(
                      icon: const Icon(Icons.wifi),
                      onPressed: _connect,
                      tooltip: 'Connect',
                    ),
          ),
          onSubmitted: (_) => _connect(),
        ),
        const SizedBox(height: 12),

        // Connection status tile.
        connStatus.when(
          data: (s) => _StatusTile(s),
          loading:
              () => const _StatusTile(
                LimenConnectionState(ConnectionStatus.connecting),
              ),
          error:
              (e, _) => _StatusTile(
                LimenConnectionState(ConnectionStatus.error, e.toString()),
              ),
        ),

        const Divider(height: 40),
        Text('Quick Actions', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),

        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _SceneChip(label: 'Home', scene: 'home', icon: Icons.home),
            _SceneChip(label: 'Launcher', scene: 'launcher', icon: Icons.apps),
            _SceneChip(
              label: 'Lock',
              scene: 'greeter',
              icon: Icons.lock_outline,
            ),
            _SceneChip(
              label: 'Ambient',
              scene: 'ambient',
              icon: Icons.animation_outlined,
            ),
          ],
        ),

        const Divider(height: 40),
        Text('About', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(Icons.info_outline, color: cs.primary),
          title: const Text('LIMEN OS Mobile Companion'),
          subtitle: const Text('v0.1.0 — Phase 1'),
        ),
      ],
    );
  }
}

class _StatusTile extends StatelessWidget {
  final LimenConnectionState state;
  const _StatusTile(this.state);

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final (color, icon, label) = switch (state.status) {
      ConnectionStatus.connected => (
        Colors.green,
        Icons.check_circle_outline,
        'Connected',
      ),
      ConnectionStatus.connecting => (cs.primary, Icons.sync, 'Connecting…'),
      ConnectionStatus.error => (
        cs.error,
        Icons.error_outline,
        state.errorMessage ?? 'Error',
      ),
      ConnectionStatus.disconnected => (
        cs.onSurface.withValues(alpha: 0.4),
        Icons.wifi_off,
        'Disconnected',
      ),
    };

    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: color),
      title: Text(label, style: TextStyle(color: color)),
    );
  }
}

class _SceneChip extends ConsumerWidget {
  final String label;
  final String scene;
  final IconData icon;
  const _SceneChip({
    required this.label,
    required this.scene,
    required this.icon,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ActionChip(
      avatar: Icon(icon, size: 16),
      label: Text(label),
      onPressed: () => ref.read(limenServiceProvider).setScene(scene),
    );
  }
}
