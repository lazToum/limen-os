import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../services/limen.dart';
import '../widgets/connection_banner.dart';
import '../widgets/responsive_scaffold.dart';
import 'remote.dart';
import 'voice.dart';
import 'settings.dart';

/// Root shell — responsive nav between Remote, Voice, Settings.
/// Phone  → bottom NavigationBar
/// Tablet → NavigationRail (compact)
/// Web    → NavigationRail (extended, with labels)
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _index = 0;

  static const _pages = <Widget>[
    RemoteScreen(),
    VoiceScreen(),
    SettingsScreen(),
  ];

  static const _destinations = <NavDest>[
    NavDest(
      label: 'Remote',
      icon: Icon(Icons.gamepad_outlined),
      selectedIcon: Icon(Icons.gamepad),
    ),
    NavDest(
      label: 'Voice',
      icon: Icon(Icons.mic_outlined),
      selectedIcon: Icon(Icons.mic),
    ),
    NavDest(
      label: 'Settings',
      icon: Icon(Icons.settings_outlined),
      selectedIcon: Icon(Icons.settings),
    ),
  ];

  @override
  void initState() {
    super.initState();
    _autoConnect();
  }

  Future<void> _autoConnect() async {
    final host = await LimenService.savedHost();
    if (host.isNotEmpty && mounted) {
      final svc = ref.read(limenServiceProvider);
      await svc.connect(host);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ResponsiveScaffold(
      destinations: _destinations,
      selectedIndex: _index,
      onDestinationSelected: (i) => setState(() => _index = i),
      topSlot: const ConnectionBanner(),
      body: _pages[_index]
          .animate(key: ValueKey(_index))
          .fadeIn(duration: 180.ms)
          .slideY(begin: 0.03, end: 0, curve: Curves.easeOutCubic),
    );
  }
}
